import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ModoProcessamento } from '../../common/enums';
import { AcrescimoParticipante } from '../../participantes/entities/acrescimo-participante.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { ErroLinha } from './csv.service';
import { ResultadoProcessamento } from './processador-base-principal.service';

/** Linha já convertida da base de acréscimo. */
export interface LinhaBaseAcrescimo {
  funcional: string;
  areaOrigem: string;
  valorAcrescimoPrI: number;
  valorAcrescimoPrF: number;
  observacao: string | null;
}

const TAMANHO_LOTE = 500;

/**
 * Processamento da base de acréscimo.
 *
 * Complementa a base principal com os valores de participantes que passaram
 * por mais de uma área. Não apaga grupos nem comitês em nenhum dos modos —
 * essa limpeza é exclusiva do upload completo da base principal.
 *
 * COMPLETO    -> substitui todos os acréscimos existentes.
 * INCREMENTAL -> atualiza os acréscimos da mesma área e insere os novos.
 */
@Injectable()
export class ProcessadorBaseAcrescimoService {
  private readonly logger = new Logger(ProcessadorBaseAcrescimoService.name);

  async processar(
    manager: EntityManager,
    registros: Array<{ linha: number; dados: LinhaBaseAcrescimo }>,
    modo: ModoProcessamento,
    importacaoId: string,
  ): Promise<ResultadoProcessamento> {
    const erros: ErroLinha[] = [];

    const funcionais = [...new Set(registros.map(({ dados }) => dados.funcional))];
    const participantes = await this.carregarParticipantes(manager, funcionais);

    // Registros cujo participante não existe na base principal viram erro.
    const validos: Array<{ linha: number; dados: LinhaBaseAcrescimo; participanteId: string }> = [];

    for (const registro of registros) {
      const participanteId = participantes.get(registro.dados.funcional);
      if (!participanteId) {
        erros.push({
          linha: registro.linha,
          coluna: 'FUNCIONAL',
          valor: registro.dados.funcional,
          mensagem:
            `Participante ${registro.dados.funcional} não encontrado na base principal. ` +
            'Importe a base principal antes da base de acréscimo.',
        });
        continue;
      }
      validos.push({ ...registro, participanteId });
    }

    const { unicos, erros: errosDuplicados } = this.removerDuplicados(validos);
    erros.push(...errosDuplicados);

    let removidos = 0;
    if (modo === ModoProcessamento.COMPLETO) {
      removidos = await manager.count(AcrescimoParticipante);
      await manager.query(`TRUNCATE TABLE "acrescimos_participante" RESTART IDENTITY`);
    }

    const existentes =
      modo === ModoProcessamento.COMPLETO
        ? new Set<string>()
        : await this.carregarChavesExistentes(manager, unicos.map((r) => r.participanteId));

    let inseridos = 0;
    let atualizados = 0;
    const entidades: Array<Partial<AcrescimoParticipante>> = [];

    for (const registro of unicos) {
      const chave = `${registro.participanteId}::${registro.dados.areaOrigem}`;
      existentes.has(chave) ? (atualizados += 1) : (inseridos += 1);

      entidades.push({
        participanteId: registro.participanteId,
        areaOrigem: registro.dados.areaOrigem,
        valorAcrescimoPrI: registro.dados.valorAcrescimoPrI,
        valorAcrescimoPrF: registro.dados.valorAcrescimoPrF,
        observacao: registro.dados.observacao ?? null,
        importacaoId,
      });
    }

    for (let i = 0; i < entidades.length; i += TAMANHO_LOTE) {
      await manager.upsert(
        AcrescimoParticipante,
        entidades.slice(i, i + TAMANHO_LOTE) as AcrescimoParticipante[],
        { conflictPaths: ['participanteId', 'areaOrigem'], skipUpdateIfNoValuesChanged: true },
      );
    }

    this.logger.log(`Base de acréscimo (${modo}): ${inseridos} inseridos, ${atualizados} atualizados`);

    return {
      inseridos,
      atualizados,
      removidos,
      erros,
      resumo: {
        modo,
        observacao:
          'Os acréscimos alteram apenas a visão anual (VL_PR_I / VL_PR_F) exibida no comitê. ' +
          'O pool continua calculado sobre o VLRTEORICO da área atual.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async carregarParticipantes(
    manager: EntityManager,
    funcionais: string[],
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    if (!funcionais.length) return mapa;

    for (let i = 0; i < funcionais.length; i += TAMANHO_LOTE) {
      const lote = funcionais.slice(i, i + TAMANHO_LOTE);
      const encontrados = await manager.find(Participante, {
        where: { funcional: In(lote) },
        select: { id: true, funcional: true },
      });
      encontrados.forEach((participante) => mapa.set(participante.funcional, participante.id));
    }
    return mapa;
  }

  private async carregarChavesExistentes(
    manager: EntityManager,
    participanteIds: string[],
  ): Promise<Set<string>> {
    const chaves = new Set<string>();
    const unicos = [...new Set(participanteIds)];

    for (let i = 0; i < unicos.length; i += TAMANHO_LOTE) {
      const lote = unicos.slice(i, i + TAMANHO_LOTE);
      const encontrados = await manager.find(AcrescimoParticipante, {
        where: { participanteId: In(lote) },
        select: { id: true, participanteId: true, areaOrigem: true },
      });
      encontrados.forEach((acrescimo) => chaves.add(`${acrescimo.participanteId}::${acrescimo.areaOrigem}`));
    }
    return chaves;
  }

  /** Mesma combinação participante + área só pode aparecer uma vez no arquivo. */
  private removerDuplicados(
    registros: Array<{ linha: number; dados: LinhaBaseAcrescimo; participanteId: string }>,
  ) {
    const porChave = new Map<string, { linha: number; dados: LinhaBaseAcrescimo; participanteId: string }>();
    const erros: ErroLinha[] = [];

    for (const registro of registros) {
      const chave = `${registro.participanteId}::${registro.dados.areaOrigem}`;
      const anterior = porChave.get(chave);
      if (anterior) {
        erros.push({
          linha: anterior.linha,
          coluna: 'AREA_ORIGEM',
          valor: registro.dados.areaOrigem,
          mensagem: `Combinação funcional + área de origem duplicada no arquivo (também na linha ${registro.linha}). Considerado o último registro.`,
        });
      }
      porChave.set(chave, registro);
    }

    return { unicos: [...porChave.values()], erros };
  }
}
