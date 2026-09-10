import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExcecaoDiscricionarioInvalido } from '../../common/filters';
import { CASAS_FATOR, Decimal, paraDecimal, paraFator, paraMoeda, somar } from '../../common/utils';
import { ConfiguracaoApp } from '../../config/configuracao';

/** Entradas mínimas para calcular os valores de um participante. */
export interface EntradaCalculoParticipante {
  valorBase: number | string;
  fbpa: number | string;
  fpi: number | string;
  /** Fator discricionário. Quando omitido, considera 0. */
  fd?: number | string | null;
}

/** Resultado consolidado dos cálculos de um participante. */
export interface ResultadoCalculoParticipante {
  fpi: number;
  fd: number;
  fpiFinal: number;
  valorPrI: number;
  valorPrF: number;
  impactoFinanceiro: number;
}

/** Composição do pool de um grupo/comitê. */
export interface ResultadoPool {
  vlrTeoricoTotal: number;
  percentual: number;
  poolTotal: number;
  totalPositivo: number;
  totalNegativo: number;
  poolUtilizado: number;
  poolDisponivel: number;
  percentualUtilizado: number;
}

/**
 * Serviço de cálculo — coração das regras financeiras.
 *
 * Fórmulas oficiais:
 *   FPI_FINAL  = FPI + FD
 *   PR_INICIAL = VALORBASE x FBPA x FPI
 *   PR_FINAL   = VALORBASE x FBPA x FPI_FINAL
 *   POOL       = VLRTEORICO total do grupo x 1%
 *
 * Nenhum cálculo acontece em controller ou no frontend: tudo passa por aqui.
 */
@Injectable()
export class CalculoService {
  /** Limite absoluto do discricionário (0.15 = 15pp). */
  readonly limiteDiscricionario: number;

  /** Percentual do VLRTEORICO que forma o pool (0.01 = 1%). */
  readonly poolPercentual: number;

  constructor(config?: ConfigService) {
    const negocio = config?.get<ConfiguracaoApp['negocio']>('negocio');
    this.limiteDiscricionario = negocio?.limiteDiscricionario ?? 0.15;
    this.poolPercentual = negocio?.poolPercentual ?? 0.01;
  }

  // ------------------------------------------------------------------
  // Fatores
  // ------------------------------------------------------------------

  /** FPI_FINAL = FPI + FD. */
  calcularFpiFinal(fpi: number | string, fd: number | string | null | undefined): number {
    return paraFator(paraDecimal(fpi).plus(paraDecimal(fd)));
  }

  // ------------------------------------------------------------------
  // Valores de PR
  // ------------------------------------------------------------------

  /** PR_INICIAL = VALORBASE x FBPA x FPI. */
  calcularPrInicial(valorBase: number | string, fbpa: number | string, fpi: number | string): number {
    return paraMoeda(paraDecimal(valorBase).times(paraDecimal(fbpa)).times(paraDecimal(fpi)));
  }

  /** PR_FINAL = VALORBASE x FBPA x FPI_FINAL. */
  calcularPrFinal(
    valorBase: number | string,
    fbpa: number | string,
    fpiFinal: number | string,
  ): number {
    return paraMoeda(paraDecimal(valorBase).times(paraDecimal(fbpa)).times(paraDecimal(fpiFinal)));
  }

  /** Impacto financeiro do discricionário: PR_FINAL - PR_INICIAL. */
  calcularImpacto(valorPrF: number | string, valorPrI: number | string): number {
    return paraMoeda(paraDecimal(valorPrF).minus(paraDecimal(valorPrI)));
  }

  /** Calcula, de uma vez, todos os valores derivados de um participante. */
  calcularParticipante(entrada: EntradaCalculoParticipante): ResultadoCalculoParticipante {
    const fpi = paraFator(entrada.fpi);
    const fd = paraFator(entrada.fd ?? 0);
    const fpiFinal = this.calcularFpiFinal(fpi, fd);

    const valorPrI = this.calcularPrInicial(entrada.valorBase, entrada.fbpa, fpi);
    const valorPrF = this.calcularPrFinal(entrada.valorBase, entrada.fbpa, fpiFinal);

    return {
      fpi,
      fd,
      fpiFinal,
      valorPrI,
      valorPrF,
      impactoFinanceiro: this.calcularImpacto(valorPrF, valorPrI),
    };
  }

  /**
   * Aplica os acréscimos à visão anual do participante.
   *
   * O pool continua sendo calculado sobre o VLRTEORICO da área atual; os
   * acréscimos entram apenas em VL_PR_I / VL_PR_F exibidos no comitê, para dar
   * ao colaborador a visão anual mesmo tendo passado por mais de uma área.
   */
  aplicarAcrescimos(
    valorPrI: number | string,
    valorPrF: number | string,
    acrescimos: Array<{ valorAcrescimoPrI: number | string; valorAcrescimoPrF: number | string }>,
  ): { valorPrIAnual: number; valorPrFAnual: number; totalAcrescimoPrI: number; totalAcrescimoPrF: number } {
    const totalPrI = somar(acrescimos.map((a) => a.valorAcrescimoPrI));
    const totalPrF = somar(acrescimos.map((a) => a.valorAcrescimoPrF));

    return {
      valorPrIAnual: paraMoeda(paraDecimal(valorPrI).plus(totalPrI)),
      valorPrFAnual: paraMoeda(paraDecimal(valorPrF).plus(totalPrF)),
      totalAcrescimoPrI: paraMoeda(totalPrI),
      totalAcrescimoPrF: paraMoeda(totalPrF),
    };
  }

  // ------------------------------------------------------------------
  // Pool
  // ------------------------------------------------------------------

  /** POOL = VLRTEORICO total x percentual configurado (1% por padrão). */
  calcularPoolTotal(vlrTeoricoTotal: number | string): number {
    return paraMoeda(paraDecimal(vlrTeoricoTotal).times(this.poolPercentual));
  }

  /**
   * Consolida o pool a partir do VLRTEORICO total e dos impactos individuais.
   * Impactos positivos consomem o pool; negativos devolvem.
   */
  consolidarPool(vlrTeoricoTotal: number | string, impactos: Array<number | string>): ResultadoPool {
    const positivos = impactos.filter((valor) => paraDecimal(valor).greaterThan(0));
    const negativos = impactos.filter((valor) => paraDecimal(valor).lessThan(0));

    return this.consolidarPoolAgregado(
      vlrTeoricoTotal,
      somar(positivos),
      somar(negativos).abs(),
    );
  }

  /**
   * Mesma consolidação, mas a partir de totais já agregados pelo banco.
   * Evita trazer milhares de impactos para a memória só para somá-los.
   */
  consolidarPoolAgregado(
    vlrTeoricoTotal: number | string | Decimal,
    totalPositivoBruto: number | string | Decimal,
    totalNegativoBruto: number | string | Decimal,
  ): ResultadoPool {
    const poolTotal = this.calcularPoolTotal(paraDecimal(vlrTeoricoTotal).toNumber());

    const totalPositivo = paraMoeda(totalPositivoBruto);
    const totalNegativo = paraMoeda(paraDecimal(totalNegativoBruto).abs());
    const poolUtilizado = paraMoeda(new Decimal(totalPositivo).minus(totalNegativo));
    const poolDisponivel = paraMoeda(new Decimal(poolTotal).minus(poolUtilizado));

    const percentualUtilizado = poolTotal
      ? new Decimal(poolUtilizado).dividedBy(poolTotal).times(100).toDecimalPlaces(4).toNumber()
      : 0;

    return {
      vlrTeoricoTotal: paraMoeda(vlrTeoricoTotal),
      percentual: this.poolPercentual,
      poolTotal,
      totalPositivo,
      totalNegativo,
      poolUtilizado,
      poolDisponivel,
      percentualUtilizado,
    };
  }

  // ------------------------------------------------------------------
  // Validações
  // ------------------------------------------------------------------

  /**
   * Valida o valor do discricionário (FD).
   * Aceita positivo, negativo e zero, desde que dentro de ±limite (±15pp).
   */
  validarValorFd(valor: unknown): number {
    if (valor === null || valor === undefined || valor === '') {
      throw new ExcecaoDiscricionarioInvalido('Valor de discricionário é obrigatório');
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      throw new ExcecaoDiscricionarioInvalido('Valor de discricionário inválido', { valor });
    }

    const decimal = paraDecimal(numero);
    if (decimal.abs().greaterThan(this.limiteDiscricionario)) {
      throw new ExcecaoDiscricionarioInvalido(
        `Valor de discricionário inválido: o limite permitido é de ${this.formatarPp(
          -this.limiteDiscricionario,
        )} a ${this.formatarPp(this.limiteDiscricionario)}`,
        {
          valorInformado: numero,
          limiteMinimo: -this.limiteDiscricionario,
          limiteMaximo: this.limiteDiscricionario,
        },
      );
    }

    return decimal.toDecimalPlaces(CASAS_FATOR, Decimal.ROUND_HALF_UP).toNumber();
  }

  /** Formata um fator como pontos percentuais (0.15 -> "+15pp"). */
  formatarPp(valor: number): string {
    const pp = paraDecimal(valor).times(100).toDecimalPlaces(2).toNumber();
    return `${pp > 0 ? '+' : ''}${pp}pp`;
  }
}
