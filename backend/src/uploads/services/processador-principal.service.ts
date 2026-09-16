import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In, IsNull, Not } from 'typeorm';
import { CalculoService } from '../../calculo/calculo.service';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { ModoCarga, TipoComite } from '../../common/enums';
import { Acrescimo } from '../../participantes/entities/acrescimo.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { Ata } from '../../comites/entities/ata.entity';
import { Comite } from '../../comites/entities/comite.entity';
import { ErroLinha } from './csv.service';
import { CAMPOS_DECISAO } from './mapeamento-colunas';

/** Linha já convertida da base principal. */
export type LinhaBasePrincipal = Record<string, unknown> & {
  emplid: string;
  nome: string;
};

export interface ResultadoProcessamento {
  inseridos: number;
  atualizados: number;
  removidos: number;
  erros: ErroLinha[];
  resumo: Record<string, unknown>;
}

const TAMANHO_LOTE = 500;

/**
 * Carga da base principal (TBPR_Simuladores), sempre dentro de um ciclo.
 *
 * COMPLETA — reinicia **apenas o ciclo alvo**: apaga comitês, ATAs, layouts,
 *            acréscimos e participantes daquele ano e recria a base. Nenhum
 *            ciclo anterior é tocado, então carregar 2027 preserva 2026.
 * PARCIAL  — atualiza/insere sem apagar nada, preservando os campos de decisão
 *            do comitê (FD, NOTA_DISCRICIONARIO, MOTIVO_DISCRICIONARIO,
 *            OBSERVACAO_POSCOMITE, COD_MOTIVADOR) e recalculando FPI_FINAL e
 *            VL_PR_F após a carga.
 */
@Injectable()
export class ProcessadorPrincipalService {
  private readonly logger = new Logger(ProcessadorPrincipalService.name);

  constructor(private readonly calculoService: CalculoService) {}

  async processar(
    manager: EntityManager,
    ciclo: Ciclo,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    modo: ModoCarga,
    importacaoId: string,
    vincularPorGrupoRanking: boolean,
  ): Promise<ResultadoProcessamento> {
    const { unicos, erros } = this.removerDuplicados(registros);

    const resultado =
      modo === ModoCarga.COMPLETA
        ? await this.processarCompleta(manager, ciclo, unicos, importacaoId, erros)
        : await this.processarParcial(manager, ciclo, unicos, importacaoId, erros);

    if (vincularPorGrupoRanking) {
      const vinculos = await this.vincularAosComites(manager, ciclo);
      resultado.resumo = { ...resultado.resumo, ...vinculos };
    }

    return resultado;
  }

  // ------------------------------------------------------------------
  // Carga completa
  // ------------------------------------------------------------------

  private async processarCompleta(
    manager: EntityManager,
    ciclo: Ciclo,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    importacaoId: string,
    erros: ErroLinha[],
  ): Promise<ResultadoProcessamento> {
    const antes = await this.contar(manager, ciclo.id);

    // A limpeza é sempre filtrada por ciclo_id — o histórico dos outros anos
    // permanece intacto. O CASCADE cobre ATAs, responsáveis e layouts.
    await manager.delete(Acrescimo, { cicloId: ciclo.id });
    await manager.delete(Participante, { cicloId: ciclo.id });
    await manager.delete(Comite, { cicloId: ciclo.id });

    const entidades = registros.map(({ dados }) =>
      this.montarParticipante(dados, null, ciclo, importacaoId),
    );
    await this.gravarEmLotes(manager, entidades);

    this.logger.log(`Carga COMPLETA do ciclo ${ciclo.ano}: ${entidades.length} participantes recriados`);

    return {
      inseridos: entidades.length,
      atualizados: 0,
      removidos: antes.participantes,
      erros,
      resumo: {
        ciclo: ciclo.ano,
        modo: ModoCarga.COMPLETA,
        dadosRemovidos: antes,
        observacao:
          `A carga completa reiniciou apenas o ciclo ${ciclo.ano}: comitês, ATAs e discricionários ` +
          'desse ano foram apagados. Os demais ciclos permanecem intactos.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Carga parcial
  // ------------------------------------------------------------------

  private async processarParcial(
    manager: EntityManager,
    ciclo: Ciclo,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    importacaoId: string,
    erros: ErroLinha[],
  ): Promise<ResultadoProcessamento> {
    const emplids = registros.map(({ dados }) => dados.emplid);
    const existentes = await this.carregarExistentes(manager, ciclo.id, emplids);

    const entidades: Array<Partial<Participante>> = [];
    let inseridos = 0;
    let atualizados = 0;

    for (const { dados } of registros) {
      const atual = existentes.get(dados.emplid) ?? null;
      entidades.push(this.montarParticipante(dados, atual, ciclo, importacaoId));
      atual ? (atualizados += 1) : (inseridos += 1);
    }

    await this.gravarEmLotes(manager, entidades);

    this.logger.log(
      `Carga PARCIAL do ciclo ${ciclo.ano}: ${inseridos} inseridos, ${atualizados} atualizados`,
    );

    return {
      inseridos,
      atualizados,
      removidos: 0,
      erros,
      resumo: {
        ciclo: ciclo.ano,
        modo: ModoCarga.PARCIAL,
        camposPreservados: CAMPOS_DECISAO,
        observacao:
          'A carga parcial preservou as decisões do comitê e recalculou FPI_FINAL e VL_PR_F.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Montagem do registro
  // ------------------------------------------------------------------

  /**
   * Monta o participante final.
   *
   * Na carga PARCIAL, os campos de decisão do comitê nunca vêm do arquivo:
   * o valor atual do banco prevalece. Os campos derivados (VL_PR_F e a nota
   * pós-discricionário) são sempre recalculados pelo `CalculoService`.
   */
  private montarParticipante(
    dados: LinhaBasePrincipal,
    atual: Participante | null,
    ciclo: Ciclo,
    importacaoId: string,
  ): Partial<Participante> {
    const registro: Record<string, unknown> = { ...dados };

    // Campos de decisão: o banco manda, não o arquivo.
    if (atual) {
      for (const campo of CAMPOS_DECISAO) {
        registro[campo] = (atual as unknown as Record<string, unknown>)[campo];
      }
      registro.motivoId = atual.motivoId;
      registro.fdForaLimite = atual.fdForaLimite;
      registro.lancadoPorId = atual.lancadoPorId;
      registro.lancadoEm = atual.lancadoEm;
      registro.comiteId = atual.comiteId;
    }

    // Coluna ausente do arquivo mantém o valor atual do banco (carga parcial).
    const numeroOu = (valor: unknown, padrao: number): number =>
      valor === null || valor === undefined ? padrao : Number(valor);

    const fpi = numeroOu(registro.fpi, Number(atual?.fpi ?? 0));
    const fd = numeroOu(registro.fd, Number(atual?.fd ?? 0));
    const calc4 = numeroOu(registro.calc4, Number(atual?.calc4 ?? 0));

    const fpiFinal = this.calculoService.calcularFpiFinal(fpi, fd);

    // O CALC4 é a BASE do PR, então os dois valores são sempre derivados dele:
    //   VL_PR_I = CALC4 × FPI        VL_PR_F = CALC4 × FPI_FINAL
    // Um VL_PR_I que venha no arquivo é apenas conferência — o cálculo manda.
    const vlPrI = this.calculoService.calcularVlPrI(calc4, fpi);
    const vlPrF = this.calculoService.calcularVlPrF(calc4, fpiFinal);

    const pontoCurva = (chave: 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'n1' | 'n2' | 'n3' | 'n4' | 'n5') =>
      registro[chave] !== undefined ? (registro[chave] as number | null) : (atual?.[chave] ?? null);

    const curva = {
      p1: pontoCurva('p1'),
      p2: pontoCurva('p2'),
      p3: pontoCurva('p3'),
      p4: pontoCurva('p4'),
      p5: pontoCurva('p5'),
      n1: pontoCurva('n1'),
      n2: pontoCurva('n2'),
      n3: pontoCurva('n3'),
      n4: pontoCurva('n4'),
      n5: pontoCurva('n5'),
    };

    return {
      ...(registro as Partial<Participante>),
      cicloId: ciclo.id,
      emplid: String(dados.emplid),
      nome: String(dados.nome),
      fpi,
      fd,
      calc4,
      vlPrI,
      vlPrF,
      notaDiscricionario:
        fd === 0
          ? null
          : (this.calculoService.interpolarNota(fpiFinal, curva) ??
            (registro.notaDiscricionario as number | null) ??
            null),
      importacaoId,
    };
  }

  private async gravarEmLotes(
    manager: EntityManager,
    entidades: Array<Partial<Participante>>,
  ): Promise<void> {
    for (let i = 0; i < entidades.length; i += TAMANHO_LOTE) {
      await manager.upsert(Participante, entidades.slice(i, i + TAMANHO_LOTE) as Participante[], {
        conflictPaths: ['cicloId', 'emplid'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  private async carregarExistentes(
    manager: EntityManager,
    cicloId: string,
    emplids: string[],
  ): Promise<Map<string, Participante>> {
    const mapa = new Map<string, Participante>();
    if (!emplids.length) return mapa;

    for (let i = 0; i < emplids.length; i += TAMANHO_LOTE) {
      const lote = emplids.slice(i, i + TAMANHO_LOTE);
      const encontrados = await manager.find(Participante, { where: { cicloId, emplid: In(lote) } });
      encontrados.forEach((participante) => mapa.set(participante.emplid, participante));
    }
    return mapa;
  }

  // ------------------------------------------------------------------
  // Vínculo automático pelo GRUPO_RANKING
  // ------------------------------------------------------------------

  /**
   * O GRUPO_RANKING da base principal já define o comitê do colaborador
   * ("código - nome"). Aqui os comitês que ainda não existem no ciclo são
   * criados e os participantes são vinculados — o Atendimento ajusta depois.
   */
  private async vincularAosComites(
    manager: EntityManager,
    ciclo: Ciclo,
  ): Promise<Record<string, unknown>> {
    const grupos = await manager
      .createQueryBuilder(Participante, 'participante')
      .select('participante.grupo_ranking', 'grupoRanking')
      .addSelect('MIN(participante.area)', 'area')
      .addSelect(
        `COUNT(*) FILTER (WHERE participante.modelo_avaliacao ILIKE 'institucional')`,
        'institucional',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE participante.modelo_avaliacao ILIKE 'comunidade')`,
        'comunidade',
      )
      .where('participante.ciclo_id = :cicloId', { cicloId: ciclo.id })
      .andWhere('participante.grupo_ranking IS NOT NULL')
      .andWhere("participante.grupo_ranking <> ''")
      .groupBy('participante.grupo_ranking')
      .getRawMany<{ grupoRanking: string; area: string; institucional: string; comunidade: string }>();

    const existentes = await manager.find(Comite, {
      where: { cicloId: ciclo.id },
      select: { id: true, grupoRanking: true },
    });
    const porGrupo = new Map(existentes.map((comite) => [comite.grupoRanking, comite.id]));

    let comitesCriados = 0;

    for (const grupo of grupos) {
      if (porGrupo.has(grupo.grupoRanking)) continue;

      const { codigo, nome } = this.separarGrupoRanking(grupo.grupoRanking);
      const comite = await manager.save(
        manager.create(Comite, {
          cicloId: ciclo.id,
          codigo,
          nome,
          grupoRanking: grupo.grupoRanking,
          area: grupo.area ?? null,
          tipo: this.definirTipo(Number(grupo.institucional), Number(grupo.comunidade)),
        }),
      );
      porGrupo.set(grupo.grupoRanking, comite.id);
      comitesCriados += 1;
    }

    // Vincula apenas quem ainda não tem comitê, para não desfazer ajustes
    // manuais feitos pelo Atendimento.
    let participantesVinculados = 0;
    for (const [grupoRanking, comiteId] of porGrupo) {
      const atualizacao = await manager.update(
        Participante,
        { cicloId: ciclo.id, grupoRanking, comiteId: IsNull() },
        { comiteId },
      );
      participantesVinculados += atualizacao.affected ?? 0;
    }

    return { comitesCriados, participantesVinculados };
  }

  /** "100702 - WMS PRIVATE" -> { codigo: "100702", nome: "WMS PRIVATE" }. */
  private separarGrupoRanking(grupoRanking: string): { codigo: string; nome: string } {
    const separador = grupoRanking.indexOf('-');
    if (separador < 0) {
      return { codigo: grupoRanking.trim().slice(0, 50), nome: grupoRanking.trim().slice(0, 150) };
    }
    return {
      codigo: grupoRanking.slice(0, separador).trim().slice(0, 50),
      nome: grupoRanking.slice(separador + 1).trim().slice(0, 150),
    };
  }

  private definirTipo(institucional: number, comunidade: number): TipoComite {
    if (institucional && comunidade) return TipoComite.MISTO;
    if (comunidade) return TipoComite.COMUNIDADE;
    return TipoComite.INSTITUCIONAL;
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /** Mesmo EMPLID repetido no arquivo: vence o último, o anterior vira aviso. */
  private removerDuplicados(registros: Array<{ linha: number; dados: LinhaBasePrincipal }>): {
    unicos: Array<{ linha: number; dados: LinhaBasePrincipal }>;
    erros: ErroLinha[];
  } {
    const porEmplid = new Map<string, { linha: number; dados: LinhaBasePrincipal }>();
    const erros: ErroLinha[] = [];

    for (const registro of registros) {
      const anterior = porEmplid.get(registro.dados.emplid);
      if (anterior) {
        erros.push({
          linha: anterior.linha,
          coluna: 'EMPLID',
          valor: registro.dados.emplid,
          mensagem: `EMPLID duplicado no arquivo (também na linha ${registro.linha}). Considerado o último registro.`,
        });
      }
      porEmplid.set(registro.dados.emplid, registro);
    }

    return { unicos: [...porEmplid.values()], erros };
  }

  private async contar(manager: EntityManager, cicloId: string): Promise<Record<string, number>> {
    const [participantes, comites, atas, acrescimos, comDiscricionario] = await Promise.all([
      manager.count(Participante, { where: { cicloId } }),
      manager.count(Comite, { where: { cicloId } }),
      manager
        .createQueryBuilder(Ata, 'ata')
        .innerJoin(Comite, 'comite', 'comite.id = ata.comite_id')
        .where('comite.ciclo_id = :cicloId', { cicloId })
        .getCount(),
      manager.count(Acrescimo, { where: { cicloId } }),
      manager.count(Participante, { where: { cicloId, fd: Not(0) } }),
    ]);

    return { participantes, comites, atas, acrescimos, discricionariosLancados: comDiscricionario };
  }
}
