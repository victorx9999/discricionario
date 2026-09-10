import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusAnalise } from '../common/enums';
import { paraMoeda } from '../common/utils';
import { AnaliseParticipante } from '../comites/entities/analise-participante.entity';
import { Comite } from '../comites/entities/comite.entity';
import { CalculoService, ResultadoPool } from '../discricionario/services/calculo.service';
import { Grupo } from '../grupos/entities/grupo.entity';
import { Participante } from '../participantes/entities/participante.entity';

export interface ResumoDashboard {
  comites: number;
  grupos: number;
  participantes: number;
  participantesEmComites: number;
  participantesAnalisados: number;
  participantesPendentes: number;
  pool: ResultadoPool;
}

export interface SerieDashboard {
  chave: string;
  participantes: number;
  analisados: number;
  pendentes: number;
  discricionarioPositivo: number;
  discricionarioNegativo: number;
  saldo: number;
}

export interface GraficosDashboard {
  porNivelCargo: SerieDashboard[];
  porStatusAnalise: Array<{ status: string; total: number }>;
  porModeloAvaliacao: SerieDashboard[];
  totalDiscricionarioPositivo: number;
  totalDiscricionarioNegativo: number;
}

/**
 * Números consolidados da página inicial.
 *
 * Todas as agregações são feitas pelo banco. O pool exibido é a soma dos
 * pools de todos os comitês existentes.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Comite) private readonly comites: Repository<Comite>,
    @InjectRepository(Grupo) private readonly grupos: Repository<Grupo>,
    @InjectRepository(Participante) private readonly participantes: Repository<Participante>,
    @InjectRepository(AnaliseParticipante) private readonly analises: Repository<AnaliseParticipante>,
    private readonly calculoService: CalculoService,
  ) {}

  async resumo(): Promise<ResumoDashboard> {
    const [comites, grupos, participantes, participantesEmComites, analisados, totais] =
      await Promise.all([
        this.comites.count(),
        this.grupos.count(),
        this.participantes.count(),
        this.analises.count(),
        this.analises.count({ where: { status: StatusAnalise.ANALISADO } }),
        this.carregarTotaisGerais(),
      ]);

    return {
      comites,
      grupos,
      participantes,
      participantesEmComites,
      participantesAnalisados: analisados,
      participantesPendentes: participantesEmComites - analisados,
      pool: this.calculoService.consolidarPoolAgregado(
        totais.vlrTeoricoTotal,
        totais.totalPositivo,
        totais.totalNegativo,
      ),
    };
  }

  async graficos(): Promise<GraficosDashboard> {
    const [porNivelCargo, porModeloAvaliacao, porStatusAnalise, totais] = await Promise.all([
      this.agrupar('participante.nivel_cargo'),
      this.agrupar('participante.modelo_avaliacao'),
      this.contarPorStatus(),
      this.carregarTotaisGerais(),
    ]);

    return {
      porNivelCargo,
      porModeloAvaliacao,
      porStatusAnalise,
      totalDiscricionarioPositivo: paraMoeda(totais.totalPositivo),
      totalDiscricionarioNegativo: paraMoeda(totais.totalNegativo),
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async carregarTotaisGerais(): Promise<{
    vlrTeoricoTotal: string;
    totalPositivo: string;
    totalNegativo: string;
  }> {
    const linha = await this.analises
      .createQueryBuilder('analise')
      .innerJoin('analise.participante', 'participante')
      .leftJoin('analise.discricionario', 'discricionario')
      .select('COALESCE(SUM(participante.vlr_teorico), 0)', 'vlrTeoricoTotal')
      .addSelect(
        'COALESCE(SUM(CASE WHEN discricionario.impacto_financeiro > 0 THEN discricionario.impacto_financeiro ELSE 0 END), 0)',
        'totalPositivo',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN discricionario.impacto_financeiro < 0 THEN -discricionario.impacto_financeiro ELSE 0 END), 0)',
        'totalNegativo',
      )
      .getRawOne<{ vlrTeoricoTotal: string; totalPositivo: string; totalNegativo: string }>();

    return {
      vlrTeoricoTotal: linha?.vlrTeoricoTotal ?? '0',
      totalPositivo: linha?.totalPositivo ?? '0',
      totalNegativo: linha?.totalNegativo ?? '0',
    };
  }

  private async agrupar(coluna: string): Promise<SerieDashboard[]> {
    const linhas = await this.analises
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
      .groupBy('chave')
      .orderBy('chave', 'ASC')
      .getRawMany<{
        chave: string;
        participantes: string;
        analisados: string;
        positivo: string;
        negativo: string;
        saldo: string;
      }>();

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
      };
    });
  }

  private async contarPorStatus(): Promise<Array<{ status: string; total: number }>> {
    const linhas = await this.analises
      .createQueryBuilder('analise')
      .select('analise.status', 'status')
      .addSelect('COUNT(analise.id)', 'total')
      .groupBy('analise.status')
      .getRawMany<{ status: string; total: string }>();

    return linhas.map((linha) => ({ status: linha.status, total: Number(linha.total) }));
  }
}
