import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StatusAnalise } from '../../common/enums';
import { paraMoeda } from '../../common/utils';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { ResultadoPool } from './calculo.service';
import { PoolService } from './pool.service';

/** Linha da tabela consolidada (por nível de cargo ou por modelo de avaliação). */
export interface LinhaResumo {
  chave: string;
  participantes: number;
  analisados: number;
  pendentes: number;
  discricionarioPositivo: number;
  discricionarioNegativo: number;
  saldo: number;
  vlrTeorico: number;
}

export interface ResumoComite {
  comiteId: string;
  totalParticipantes: number;
  participantesAnalisados: number;
  participantesPendentes: number;
  pool: ResultadoPool;
  porNivelCargo: LinhaResumo[];
  porModeloAvaliacao: LinhaResumo[];
}

interface LinhaBruta {
  chave: string | null;
  participantes: string;
  analisados: string;
  positivo: string;
  negativo: string;
  saldo: string;
  vlrTeorico: string;
}

/**
 * Resumos consolidados do comitê.
 *
 * Toda agregação é feita pelo banco (GROUP BY), então a tabela do frontend
 * pode ser recarregada a cada alteração sem custo de memória no backend.
 */
@Injectable()
export class ResumoService {
  constructor(
    @InjectRepository(AnaliseParticipante)
    private readonly analises: Repository<AnaliseParticipante>,
    private readonly poolService: PoolService,
  ) {}

  /** Resumo completo: pool + consolidação por nível de cargo e modelo de avaliação. */
  async resumoComite(comiteId: string, manager?: EntityManager): Promise<ResumoComite> {
    const [pool, porNivelCargo, porModeloAvaliacao, contagens] = await Promise.all([
      this.poolService.consolidar(comiteId, manager),
      this.agrupar(comiteId, 'participante.nivel_cargo', manager),
      this.agrupar(comiteId, 'participante.modelo_avaliacao', manager),
      this.contarAnalises(comiteId, manager),
    ]);

    return {
      comiteId,
      totalParticipantes: contagens.total,
      participantesAnalisados: contagens.analisados,
      participantesPendentes: contagens.total - contagens.analisados,
      pool,
      porNivelCargo,
      porModeloAvaliacao,
    };
  }

  /** Tabela consolidada por nível de cargo. */
  resumoPorNivelCargo(comiteId: string, manager?: EntityManager): Promise<LinhaResumo[]> {
    return this.agrupar(comiteId, 'participante.nivel_cargo', manager);
  }

  /** Tabela consolidada por modelo de avaliação. */
  resumoPorModeloAvaliacao(comiteId: string, manager?: EntityManager): Promise<LinhaResumo[]> {
    return this.agrupar(comiteId, 'participante.modelo_avaliacao', manager);
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async agrupar(
    comiteId: string,
    coluna: string,
    manager?: EntityManager,
  ): Promise<LinhaResumo[]> {
    const repositorio = manager ? manager.getRepository(AnaliseParticipante) : this.analises;

    const linhas = await repositorio
      .createQueryBuilder('analise')
      .innerJoin('analise.participante', 'participante')
      .leftJoin('analise.discricionario', 'discricionario')
      .select(`COALESCE(${coluna}, 'Não informado')`, 'chave')
      .addSelect('COUNT(analise.id)', 'participantes')
      .addSelect('COUNT(discricionario.id)', 'analisados')
      .addSelect(
        'COALESCE(SUM(CASE WHEN discricionario.impacto_financeiro > 0 THEN discricionario.impacto_financeiro ELSE 0 END), 0)',
        'positivo',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN discricionario.impacto_financeiro < 0 THEN discricionario.impacto_financeiro ELSE 0 END), 0)',
        'negativo',
      )
      .addSelect('COALESCE(SUM(discricionario.impacto_financeiro), 0)', 'saldo')
      .addSelect('COALESCE(SUM(participante.vlr_teorico), 0)', 'vlrTeorico')
      .where('analise.comite_id = :comiteId', { comiteId })
      .groupBy('chave')
      .orderBy('chave', 'ASC')
      .getRawMany<LinhaBruta>();

    return linhas.map((linha) => {
      const participantes = Number(linha.participantes);
      const analisados = Number(linha.analisados);
      return {
        chave: linha.chave ?? 'Não informado',
        participantes,
        analisados,
        pendentes: participantes - analisados,
        discricionarioPositivo: paraMoeda(linha.positivo),
        discricionarioNegativo: paraMoeda(linha.negativo),
        saldo: paraMoeda(linha.saldo),
        vlrTeorico: paraMoeda(linha.vlrTeorico),
      };
    });
  }

  private async contarAnalises(
    comiteId: string,
    manager?: EntityManager,
  ): Promise<{ total: number; analisados: number }> {
    const repositorio = manager ? manager.getRepository(AnaliseParticipante) : this.analises;

    const [total, analisados] = await Promise.all([
      repositorio.count({ where: { comiteId } }),
      repositorio.count({ where: { comiteId, status: StatusAnalise.ANALISADO } }),
    ]);

    return { total, analisados };
  }
}
