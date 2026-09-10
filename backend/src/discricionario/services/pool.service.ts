import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ExcecaoPool } from '../../common/filters';
import { paraDecimal, paraMoeda } from '../../common/utils';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { CalculoService, ResultadoPool } from './calculo.service';

interface TotaisComite {
  vlrTeoricoTotal: string;
  totalPositivo: string;
  totalNegativo: string;
}

/**
 * Controle do pool de um comitê.
 *
 * Base do pool: soma do VLRTEORICO dos participantes do comitê (área atual).
 * Consumo: impactos financeiros positivos; devolução: impactos negativos.
 */
@Injectable()
export class PoolService {
  constructor(
    @InjectRepository(AnaliseParticipante)
    private readonly analises: Repository<AnaliseParticipante>,
    private readonly calculoService: CalculoService,
  ) {}

  /** Situação atual do pool do comitê. */
  async consolidar(comiteId: string, manager?: EntityManager): Promise<ResultadoPool> {
    const totais = await this.carregarTotais(comiteId, manager);
    return this.calculoService.consolidarPoolAgregado(
      totais.vlrTeoricoTotal,
      totais.totalPositivo,
      totais.totalNegativo,
    );
  }

  /**
   * Simula a gravação de um discricionário e bloqueia se o pool estourar.
   *
   * @param impactoAnterior impacto já contabilizado (0 quando é um lançamento novo)
   * @param impactoNovo     impacto que passará a valer
   */
  async validarLancamento(
    comiteId: string,
    impactoAnterior: number,
    impactoNovo: number,
    manager?: EntityManager,
  ): Promise<ResultadoPool> {
    const totais = await this.carregarTotais(comiteId, manager);

    const positivoProjetado = paraDecimal(totais.totalPositivo)
      .minus(impactoAnterior > 0 ? impactoAnterior : 0)
      .plus(impactoNovo > 0 ? impactoNovo : 0);

    const negativoProjetado = paraDecimal(totais.totalNegativo)
      .minus(impactoAnterior < 0 ? Math.abs(impactoAnterior) : 0)
      .plus(impactoNovo < 0 ? Math.abs(impactoNovo) : 0);

    const projecao = this.calculoService.consolidarPoolAgregado(
      totais.vlrTeoricoTotal,
      positivoProjetado,
      negativoProjetado,
    );

    if (projecao.poolDisponivel < 0) {
      throw new ExcecaoPool(
        'Operação não permitida: o valor ultrapassa o pool disponível do comitê',
        {
          poolTotal: projecao.poolTotal,
          poolUtilizadoProjetado: projecao.poolUtilizado,
          excedente: paraMoeda(Math.abs(projecao.poolDisponivel)),
          impactoSolicitado: impactoNovo,
        },
      );
    }

    return projecao;
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /** Agrega no banco — nada é somado em memória. */
  private async carregarTotais(comiteId: string, manager?: EntityManager): Promise<TotaisComite> {
    const repositorio = manager ? manager.getRepository(AnaliseParticipante) : this.analises;

    const linha = await repositorio
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
      .where('analise.comite_id = :comiteId', { comiteId })
      .getRawOne<TotaisComite>();

    return {
      vlrTeoricoTotal: linha?.vlrTeoricoTotal ?? '0',
      totalPositivo: linha?.totalPositivo ?? '0',
      totalNegativo: linha?.totalNegativo ?? '0',
    };
  }
}
