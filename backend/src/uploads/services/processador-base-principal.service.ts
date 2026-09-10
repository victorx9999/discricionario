import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ModoProcessamento } from '../../common/enums';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { Comite } from '../../comites/entities/comite.entity';
import { Discricionario } from '../../discricionario/entities/discricionario.entity';
import { CalculoService } from '../../discricionario/services/calculo.service';
import { Grupo } from '../../grupos/entities/grupo.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { ErroLinha } from './csv.service';

/** Linha já convertida da base principal. */
export interface LinhaBasePrincipal {
  funcional: string;
  nome: string;
  cargo: string | null;
  nivelCargo: string | null;
  modeloAvaliacao: string | null;
  area: string | null;
  areaOrigem: string | null;
  fpi: number | null;
  fpiFinal: number | null;
  fbpa: number | null;
  fd: number | null;
  valorBase: number | null;
  valorPrI: number | null;
  valorPrF: number | null;
  vlrTeorico: number | null;
}

export interface ResultadoProcessamento {
  inseridos: number;
  atualizados: number;
  removidos: number;
  erros: ErroLinha[];
  resumo: Record<string, unknown>;
}

const TAMANHO_LOTE = 500;

/**
 * Processamento da base principal.
 *
 * COMPLETO      -> substitui a base: limpa as tabelas dependentes (grupos,
 *                  comitês, análises, discricionários e acréscimos) e recria
 *                  os participantes.
 * INCREMENTAL   -> preserva grupos e comitês: atualiza os participantes
 *                  existentes, insere os novos e ressincroniza os valores
 *                  calculados dos discricionários já lançados.
 */
@Injectable()
export class ProcessadorBasePrincipalService {
  private readonly logger = new Logger(ProcessadorBasePrincipalService.name);

  constructor(private readonly calculoService: CalculoService) {}

  async processar(
    manager: EntityManager,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    modo: ModoProcessamento,
    importacaoId: string,
  ): Promise<ResultadoProcessamento> {
    const { unicos, erros } = this.removerDuplicados(registros);

    return modo === ModoProcessamento.COMPLETO
      ? this.processarCompleto(manager, unicos, importacaoId, erros)
      : this.processarIncremental(manager, unicos, importacaoId, erros);
  }

  // ------------------------------------------------------------------
  // Upload completo
  // ------------------------------------------------------------------

  private async processarCompleto(
    manager: EntityManager,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    importacaoId: string,
    erros: ErroLinha[],
  ): Promise<ResultadoProcessamento> {
    const antes = await this.contarDependentes(manager);

    // A limpeza segue a ordem inversa das dependências; o CASCADE cobre as
    // tabelas de junção (grupo_participantes, grupo_responsaveis).
    await manager.query(`
      TRUNCATE TABLE
        "discricionarios",
        "analises_participante",
        "comites",
        "grupo_participantes",
        "grupo_responsaveis",
        "grupos",
        "acrescimos_participante",
        "participantes"
      RESTART IDENTITY CASCADE
    `);

    const entidades = registros.map(({ dados }) => this.montarParticipante(dados, null, importacaoId));
    await this.gravarEmLotes(manager, entidades);

    this.logger.log(`Upload completo: ${entidades.length} participantes recriados`);

    return {
      inseridos: entidades.length,
      atualizados: 0,
      removidos: antes.participantes,
      erros,
      resumo: {
        modo: ModoProcessamento.COMPLETO,
        dadosRemovidos: antes,
        observacao:
          'Upload completo substitui a base: grupos, comitês, análises e discricionários anteriores foram removidos.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Upload incremental
  // ------------------------------------------------------------------

  private async processarIncremental(
    manager: EntityManager,
    registros: Array<{ linha: number; dados: LinhaBasePrincipal }>,
    importacaoId: string,
    erros: ErroLinha[],
  ): Promise<ResultadoProcessamento> {
    const funcionais = registros.map(({ dados }) => dados.funcional);
    const existentes = await this.carregarExistentes(manager, funcionais);

    const entidades: Array<Partial<Participante>> = [];
    let inseridos = 0;
    let atualizados = 0;

    for (const { dados } of registros) {
      const atual = existentes.get(dados.funcional) ?? null;
      entidades.push(this.montarParticipante(dados, atual, importacaoId));
      atual ? (atualizados += 1) : (inseridos += 1);
    }

    await this.gravarEmLotes(manager, entidades);

    // Os grupos existentes continuam apontando para os mesmos participantes;
    // o que precisa ser refeito são os valores calculados já lançados.
    const idsAtualizados = [...existentes.values()].map((participante) => participante.id);
    const discricionariosAtualizados = await this.ressincronizarDiscricionarios(manager, idsAtualizados);

    this.logger.log(
      `Upload incremental: ${inseridos} inseridos, ${atualizados} atualizados, ` +
        `${discricionariosAtualizados} discricionários ressincronizados`,
    );

    return {
      inseridos,
      atualizados,
      removidos: 0,
      erros,
      resumo: {
        modo: ModoProcessamento.INCREMENTAL,
        discricionariosRessincronizados: discricionariosAtualizados,
        observacao:
          'Upload incremental preserva grupos e comitês; apenas os dados dos participantes foram atualizados.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /**
   * Monta o registro final do participante.
   *
   * No incremental, campos ausentes no arquivo mantêm o valor atual.
   * Os valores derivados (FPI_FINAL, VL_PR_I, VL_PR_F) são sempre recalculados
   * pelo `CalculoService` — nunca copiados do arquivo — para garantir
   * consistência com as fórmulas oficiais.
   */
  private montarParticipante(
    dados: LinhaBasePrincipal,
    atual: Participante | null,
    importacaoId: string,
  ): Partial<Participante> {
    const manter = <T>(novo: T | null | undefined, anterior: T, padrao: T): T =>
      novo !== null && novo !== undefined ? novo : (atual ? anterior : padrao);

    const fpi = manter(dados.fpi, atual?.fpi, 0);
    const fbpa = manter(dados.fbpa, atual?.fbpa, 0);
    const valorBase = manter(dados.valorBase, atual?.valorBase, 0);

    // FD explícito tem prioridade; senão é deduzido de FPI_FINAL - FPI.
    let fd: number;
    if (dados.fd !== null && dados.fd !== undefined) {
      fd = dados.fd;
    } else if (dados.fpiFinal !== null && dados.fpiFinal !== undefined) {
      fd = Number((dados.fpiFinal - fpi).toFixed(6));
    } else {
      fd = atual?.fd ?? 0;
    }

    const calculo = this.calculoService.calcularParticipante({ valorBase, fbpa, fpi, fd });

    return {
      funcional: dados.funcional,
      nome: manter(dados.nome, atual?.nome, dados.nome),
      cargo: manter(dados.cargo, atual?.cargo, null),
      nivelCargo: manter(dados.nivelCargo, atual?.nivelCargo, null),
      modeloAvaliacao: manter(dados.modeloAvaliacao, atual?.modeloAvaliacao, null),
      area: manter(dados.area, atual?.area, null),
      areaOrigem: manter(dados.areaOrigem, atual?.areaOrigem, null),
      fpi: calculo.fpi,
      fd: calculo.fd,
      fpiFinal: calculo.fpiFinal,
      fbpa,
      valorBase,
      valorPrI: calculo.valorPrI,
      valorPrF: calculo.valorPrF,
      vlrTeorico: manter(dados.vlrTeorico, atual?.vlrTeorico, 0),
      ativo: true,
      importacaoId,
    };
  }

  /** Grava em lotes usando UPSERT por `funcional`. */
  private async gravarEmLotes(manager: EntityManager, entidades: Array<Partial<Participante>>): Promise<void> {
    for (let i = 0; i < entidades.length; i += TAMANHO_LOTE) {
      const lote = entidades.slice(i, i + TAMANHO_LOTE);
      await manager.upsert(Participante, lote as Participante[], {
        conflictPaths: ['funcional'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  private async carregarExistentes(
    manager: EntityManager,
    funcionais: string[],
  ): Promise<Map<string, Participante>> {
    const mapa = new Map<string, Participante>();
    if (!funcionais.length) return mapa;

    for (let i = 0; i < funcionais.length; i += TAMANHO_LOTE) {
      const lote = funcionais.slice(i, i + TAMANHO_LOTE);
      const encontrados = await manager.find(Participante, { where: { funcional: In(lote) } });
      encontrados.forEach((participante) => mapa.set(participante.funcional, participante));
    }
    return mapa;
  }

  /**
   * Recalcula os snapshots dos discricionários dos participantes atualizados.
   * O FD lançado no comitê é preservado; apenas os valores derivados mudam.
   */
  private async ressincronizarDiscricionarios(
    manager: EntityManager,
    participanteIds: string[],
  ): Promise<number> {
    if (!participanteIds.length) return 0;

    let total = 0;

    for (let i = 0; i < participanteIds.length; i += TAMANHO_LOTE) {
      const lote = participanteIds.slice(i, i + TAMANHO_LOTE);

      const discricionarios = await manager.find(Discricionario, {
        where: { analise: { participanteId: In(lote) } },
        relations: { analise: { participante: true } },
      });

      for (const discricionario of discricionarios) {
        const participante = discricionario.analise?.participante;
        if (!participante) continue;

        const calculo = this.calculoService.calcularParticipante({
          valorBase: participante.valorBase,
          fbpa: participante.fbpa,
          fpi: participante.fpi,
          fd: discricionario.valorFd,
        });

        await manager.update(
          Discricionario,
          { id: discricionario.id },
          {
            fpiFinalCalculado: calculo.fpiFinal,
            valorPrICalculado: calculo.valorPrI,
            valorPrFCalculado: calculo.valorPrF,
            impactoFinanceiro: calculo.impactoFinanceiro,
          },
        );
        total += 1;
      }
    }

    return total;
  }

  /** Remove funcionais repetidos dentro do próprio arquivo (o último vence). */
  private removerDuplicados(registros: Array<{ linha: number; dados: LinhaBasePrincipal }>): {
    unicos: Array<{ linha: number; dados: LinhaBasePrincipal }>;
    erros: ErroLinha[];
  } {
    const porFuncional = new Map<string, { linha: number; dados: LinhaBasePrincipal }>();
    const erros: ErroLinha[] = [];

    for (const registro of registros) {
      const anterior = porFuncional.get(registro.dados.funcional);
      if (anterior) {
        erros.push({
          linha: anterior.linha,
          coluna: 'FUNCIONAL',
          valor: registro.dados.funcional,
          mensagem: `Funcional duplicado no arquivo (também na linha ${registro.linha}). Considerado o último registro.`,
        });
      }
      porFuncional.set(registro.dados.funcional, registro);
    }

    return { unicos: [...porFuncional.values()], erros };
  }

  private async contarDependentes(manager: EntityManager): Promise<Record<string, number>> {
    const [participantes, grupos, comites, analises, discricionarios] = await Promise.all([
      manager.count(Participante),
      manager.count(Grupo),
      manager.count(Comite),
      manager.count(AnaliseParticipante),
      manager.count(Discricionario),
    ]);
    return { participantes, grupos, comites, analises, discricionarios };
  }
}
