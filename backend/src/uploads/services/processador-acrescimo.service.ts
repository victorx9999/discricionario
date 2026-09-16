import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { CalculoService } from '../../calculo/calculo.service';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { Acrescimo } from '../../participantes/entities/acrescimo.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { ErroLinha } from './csv.service';
import { ResultadoProcessamento } from './processador-principal.service';

export type LinhaBaseAcrescimo = Record<string, unknown> & { emplid: string };

const TAMANHO_LOTE = 500;

/**
 * Carga da base de acréscimo (TBPR_Simuladores_Acres).
 *
 * Conforme a seção 4.2, esta base é **sempre truncate** — mas apenas dentro do
 * ciclo alvo. O casamento com a base principal é por EMPLID; o GRUPO_RANKING
 * pode vir vazio aqui porque o grupo já está definido na base principal.
 *
 * A elegibilidade (`FLAG_CALCULAR_POOL`, `TIPO_SIMULADOR = Institucional`,
 * `IDPOOL = Dentro de Pool`) não é filtrada na carga: a linha é gravada como
 * veio e a regra é aplicada no cálculo, para que a tela consiga mostrar
 * por que um acréscimo não entrou.
 */
@Injectable()
export class ProcessadorAcrescimoService {
  private readonly logger = new Logger(ProcessadorAcrescimoService.name);

  constructor(private readonly calculoService: CalculoService) {}

  async processar(
    manager: EntityManager,
    ciclo: Ciclo,
    registros: Array<{ linha: number; dados: LinhaBaseAcrescimo }>,
    importacaoId: string,
  ): Promise<ResultadoProcessamento> {
    const erros: ErroLinha[] = [];

    const removidos = await manager.count(Acrescimo, { where: { cicloId: ciclo.id } });
    await manager.delete(Acrescimo, { cicloId: ciclo.id });

    const emplids = [...new Set(registros.map(({ dados }) => dados.emplid))];
    const participantes = await this.carregarParticipantes(manager, ciclo.id, emplids);

    const entidades: Array<Partial<Acrescimo>> = [];
    let semParticipante = 0;
    let elegiveis = 0;

    for (const registro of registros) {
      const participanteId = participantes.get(registro.dados.emplid) ?? null;

      if (!participanteId) {
        semParticipante += 1;
        erros.push({
          linha: registro.linha,
          coluna: 'EMPLID',
          valor: registro.dados.emplid,
          mensagem:
            `EMPLID ${registro.dados.emplid} não encontrado na base principal do ciclo ${ciclo.ano}. ` +
            'Carregue a base principal antes da base de acréscimo.',
        });
        continue;
      }

      const vlrTeorico = Number(registro.dados.vlrTeorico ?? 0);
      const calc4 = Number(registro.dados.calc4 ?? 0);
      const fpi = Number(registro.dados.fpi ?? 0);

      // Com CALC4 e FPI próprios, o VL_PR_I do acréscimo é derivado igual ao do
      // titular (CALC4 × FPI). Sem eles, vale o VL_PR_I do arquivo e, na falta
      // dele, o VLR_TEORICO informado.
      const vlPrI =
        calc4 && fpi
          ? this.calculoService.calcularVlPrI(calc4, fpi)
          : registro.dados.vlPrI === null || registro.dados.vlPrI === undefined
            ? vlrTeorico
            : Number(registro.dados.vlPrI);

      const entidade: Partial<Acrescimo> = {
        cicloId: ciclo.id,
        participanteId,
        emplid: registro.dados.emplid,
        flagCalcularPool: Boolean(registro.dados.flagCalcularPool),
        tipoSimulador: (registro.dados.tipoSimulador as string) ?? null,
        idpool: (registro.dados.idpool as string) ?? null,
        grupoRanking: (registro.dados.grupoRanking as string) ?? null,
        area: (registro.dados.area as string) ?? null,
        vlrTeorico,
        vlPrI,
        calc4,
        fpi,
        importacaoId,
      };

      if (this.ehElegivel(entidade)) elegiveis += 1;
      entidades.push(entidade);
    }

    for (let i = 0; i < entidades.length; i += TAMANHO_LOTE) {
      await manager.insert(Acrescimo, entidades.slice(i, i + TAMANHO_LOTE));
    }

    this.logger.log(
      `Base de acréscimo do ciclo ${ciclo.ano}: ${entidades.length} linhas gravadas (${elegiveis} elegíveis)`,
    );

    return {
      inseridos: entidades.length,
      atualizados: 0,
      removidos,
      erros,
      resumo: {
        ciclo: ciclo.ano,
        elegiveis,
        naoElegiveis: entidades.length - elegiveis,
        semParticipanteNaBasePrincipal: semParticipante,
        observacao:
          'O acréscimo só entra no PR e no pool quando FLAG_CALCULAR_POOL = Verdadeiro, ' +
          'TIPO_SIMULADOR = "Institucional" e IDPOOL = "Dentro de Pool".',
      },
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private ehElegivel(acrescimo: Partial<Acrescimo>): boolean {
    return (
      acrescimo.flagCalcularPool === true &&
      (acrescimo.tipoSimulador ?? '').trim().toLowerCase() === 'institucional' &&
      (acrescimo.idpool ?? '').trim().toLowerCase() === 'dentro de pool'
    );
  }

  private async carregarParticipantes(
    manager: EntityManager,
    cicloId: string,
    emplids: string[],
  ): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    if (!emplids.length) return mapa;

    for (let i = 0; i < emplids.length; i += TAMANHO_LOTE) {
      const lote = emplids.slice(i, i + TAMANHO_LOTE);
      const encontrados = await manager.find(Participante, {
        where: { cicloId, emplid: In(lote) },
        select: { id: true, emplid: true },
      });
      encontrados.forEach((participante) => mapa.set(participante.emplid, participante.id));
    }
    return mapa;
  }
}
