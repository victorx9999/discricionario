import { Injectable } from '@nestjs/common';
import { CASAS_FATOR, Decimal, paraDecimal, paraFator, paraMoeda, somar } from '../common/utils';
import { ExcecaoDiscricionarioInvalido } from '../common/filters';
import { ResultadoChecagem } from '../common/enums';

// ------------------------------------------------------------------
// Contratos
// ------------------------------------------------------------------

/** Curva de interpolação da nota: P1..P5 (FPI) -> N1..N5 (nota). */
export interface CurvaNota {
  p1?: number | null;
  p2?: number | null;
  p3?: number | null;
  p4?: number | null;
  p5?: number | null;
  n1?: number | null;
  n2?: number | null;
  n3?: number | null;
  n4?: number | null;
  n5?: number | null;
}

/** Acréscimo já filtrado por elegibilidade. */
export interface AcrescimoCalculo {
  vlrTeorico: number;
  vlPrI: number;
  calc4: number;
  fpi: number;
}

/** Entrada mínima do cálculo de um participante. */
export interface EntradaCalculo extends CurvaNota {
  fpi: number;
  fd?: number | null;
  /** CALC4 — base do PR. VL_PR_I = CALC4 × FPI. */
  calc4: number;
  /**
   * Ignorado no cálculo: o VL_PR_I é sempre derivado de CALC4 × FPI.
   * Permanece no contrato porque a entidade `Participante` o carrega.
   */
  vlPrI?: number;
  nota?: number | null;
  vlrTeorico?: number | null;
  prAnoAnterior2?: number | null;
  totalCash?: number | null;
  totalCashAnoAnterior2?: number | null;
  socioAno?: boolean;
  socioAnoAnterior?: boolean;
}

/** Premissas vigentes do ciclo usadas nos cálculos. */
export interface PremissasCalculo {
  percentualPool: number;
  limiteFd: number;
  divisorHcMax: number;
  fatorPep: number;
  fatorDiferimento: number;
}

export const PREMISSAS_PADRAO: PremissasCalculo = {
  percentualPool: 0.01,
  limiteFd: 0.15,
  divisorHcMax: 3,
  fatorPep: 0.725,
  fatorDiferimento: 0.7,
};

/** Resultado completo dos campos de saída (seção 5.1 e 5.2). */
export interface ResultadoCalculo {
  fpi: number;
  fd: number;
  fpiFinal: number;
  vlPrI: number;
  vlPrF: number;
  prSemDiscricionario: number;
  prPosDiscricionario: number;
  diferencaDiscricionario: number;
  notaPosDiscricionario: number | null;
  totalAcrescimoPrI: number;
  totalAcrescimoPrF: number;
  vlrTeoricoTotal: number;
  percentualRv: number | null;
  percentualTc: number | null;
  tcMaisSociosAnterior: number;
  tcMaisSociosAtual: number;
  deltaTcMaisSocios: number | null;
}

export interface ResultadoPool {
  vlrTeoricoTotal: number;
  percentual: number;
  poolDisponivel: number;
  poolConsumido: number;
  saldo: number;
  percentualUtilizado: number;
  excedido: boolean;
}

/**
 * Serviço de cálculo — implementa literalmente as fórmulas oficiais.
 *
 *   FPI_FINAL   = FPI + FD
 *   VL_PR_I     = CALC4 × FPI            (PR sem o discricionário)
 *   VL_PR_F     = CALC4 × FPI_FINAL      (PR com o discricionário)
 *   PR SEM DISC = VL_PR_I + Σ acréscimo (VL_PR_I do acréscimo)
 *   PR PÓS DISC = VL_PR_F + Σ acréscimo (mesmo FD do titular)
 *   DIFERENÇA   = arredondar(PR pós − PR sem; 2)
 *   POOL        = Σ VLR_TEORICO × 1%
 *   CONSUMO     = Σ (PR pós − PR sem)
 *
 * Exemplo: CALC4 500.000 · FPI 1,05 · FD 0,05 -> FPI_FINAL 1,10,
 * VL_PR_I 525.000 e VL_PR_F 550.000.
 *
 * Nada é calculado em controller nem no frontend: a API devolve pronto.
 * Todas as contas passam por `decimal.js` — sem erro de ponto flutuante.
 */
@Injectable()
export class CalculoService {
  // ------------------------------------------------------------------
  // Fatores e PR
  // ------------------------------------------------------------------

  /** FPI_FINAL = FPI + FD. */
  calcularFpiFinal(fpi: number | string, fd: number | string | null | undefined): number {
    return paraFator(paraDecimal(fpi).plus(paraDecimal(fd)));
  }

  /** VL_PR_I = CALC4 × FPI — o PR antes do discricionário. */
  calcularVlPrI(calc4: number | string, fpi: number | string): number {
    return paraMoeda(paraDecimal(calc4).times(paraDecimal(fpi)));
  }

  /**
   * VL_PR_F = CALC4 × FPI_FINAL — o PR depois do discricionário.
   *
   * O CALC4 é a base do PR; o que muda entre o valor inicial e o final é
   * apenas o fator aplicado (FPI vira FPI_FINAL = FPI + FD).
   */
  calcularVlPrF(calc4: number | string, fpiFinal: number | string): number {
    return paraMoeda(paraDecimal(calc4).times(paraDecimal(fpiFinal)));
  }

  /** PR SEM DISC. = VL_PR_I + Σ acréscimo (VL_PR_I do acréscimo). */
  calcularPrSemDiscricionario(vlPrI: number | string, acrescimos: AcrescimoCalculo[] = []): number {
    const totalAcrescimos = somar(acrescimos.map((acrescimo) => this.calcularAcrescimoSem(acrescimo)));
    return paraMoeda(paraDecimal(vlPrI).plus(totalAcrescimos));
  }

  /**
   * PR PÓS DISC. = VL_PR_F + Σ acréscimo recalculado com o **mesmo FD do titular**.
   *
   * Quando o acréscimo não traz CALC4/FPI próprios, ele entra pelo valor
   * informado (`vlPrI`) — sem efeito do discricionário, que é o comportamento
   * conservador.
   */
  calcularPrPosDiscricionario(
    vlPrF: number | string,
    acrescimos: AcrescimoCalculo[] = [],
    fd: number | string = 0,
  ): number {
    const totalAcrescimos = acrescimos.reduce(
      (acumulado, acrescimo) => acumulado.plus(this.calcularAcrescimoPos(acrescimo, fd)),
      new Decimal(0),
    );
    return paraMoeda(paraDecimal(vlPrF).plus(totalAcrescimos));
  }

  /**
   * Valor de um acréscimo **sem** discricionário: CALC4 × FPI do próprio
   * acréscimo. Sem CALC4/FPI próprios, vale o VL_PR_I informado no arquivo.
   */
  calcularAcrescimoSem(acrescimo: AcrescimoCalculo): number {
    if (!acrescimo.calc4 || !acrescimo.fpi) {
      return paraMoeda(acrescimo.vlPrI);
    }
    return this.calcularVlPrI(acrescimo.calc4, acrescimo.fpi);
  }

  /**
   * Valor de um acréscimo **com** discricionário: CALC4 × (FPI + FD do titular).
   * Sem CALC4/FPI próprios, entra pelo VL_PR_I informado — sem efeito do FD.
   */
  calcularAcrescimoPos(acrescimo: AcrescimoCalculo, fd: number | string = 0): number {
    if (!acrescimo.calc4 || !acrescimo.fpi) {
      return paraMoeda(acrescimo.vlPrI);
    }
    return this.calcularVlPrF(acrescimo.calc4, this.calcularFpiFinal(acrescimo.fpi, fd));
  }

  /** DIFERENÇA DISCRICIONÁRIO = arredondar(PR pós − PR sem; 2). */
  calcularDiferencaDiscricionario(prPos: number | string, prSem: number | string): number {
    return paraMoeda(paraDecimal(prPos).minus(paraDecimal(prSem)));
  }

  // ------------------------------------------------------------------
  // Nota interpolada
  // ------------------------------------------------------------------

  /**
   * N PÓS DISCRICIONÁRIO — nota interpolada na curva P1..P5 / N1..N5 a partir
   * do FPI_FINAL. Interpolação linear entre os pontos; fora da curva, o valor
   * é preso ao extremo mais próximo.
   *
   * Sem curva informada devolve `null` — a API expõe a nota original.
   */
  interpolarNota(fpiFinal: number | string, curva: CurvaNota): number | null {
    const pontos: Array<{ p: number; n: number }> = [];

    for (const indice of [1, 2, 3, 4, 5] as const) {
      const p = curva[`p${indice}` as keyof CurvaNota];
      const n = curva[`n${indice}` as keyof CurvaNota];
      if (p === null || p === undefined || n === null || n === undefined) continue;
      pontos.push({ p: Number(p), n: Number(n) });
    }

    if (pontos.length < 2) return null;

    pontos.sort((a, b) => a.p - b.p);
    const alvo = paraDecimal(fpiFinal).toNumber();

    if (alvo <= pontos[0].p) return this.arredondarNota(pontos[0].n);
    const ultimo = pontos[pontos.length - 1];
    if (alvo >= ultimo.p) return this.arredondarNota(ultimo.n);

    for (let i = 0; i < pontos.length - 1; i += 1) {
      const inicio = pontos[i];
      const fim = pontos[i + 1];
      if (alvo < inicio.p || alvo > fim.p) continue;

      const intervalo = fim.p - inicio.p;
      if (intervalo === 0) return this.arredondarNota(fim.n);

      const proporcao = paraDecimal(alvo - inicio.p).dividedBy(intervalo);
      const nota = paraDecimal(inicio.n).plus(proporcao.times(fim.n - inicio.n));
      return this.arredondarNota(nota.toNumber());
    }

    return this.arredondarNota(ultimo.n);
  }

  // ------------------------------------------------------------------
  // Comparativos e sócios
  // ------------------------------------------------------------------

  /** % RV {A} x {P} = (PR pós disc. ÷ PR_ANO_ANTERIOR2) − 1. */
  calcularPercentualRv(prPos: number | string, prAnoAnterior: number | string | null): number | null {
    return this.variacao(prPos, prAnoAnterior);
  }

  /** % TC {A} x {P} = (TOTAL_CASH ÷ TOTAL_CASH_ANO_ANTERIOR2) − 1. */
  calcularPercentualTc(
    totalCash: number | string,
    totalCashAnterior: number | string | null,
  ): number | null {
    return this.variacao(totalCash, totalCashAnterior);
  }

  /**
   * TC + P.Sócios — quando o colaborador é sócio, o Total Cash soma a parcela
   * de sócios: `PR × fator PEP × fator de diferimento`.
   */
  calcularTotalCashComSocios(
    ehSocio: boolean,
    pr: number | string,
    totalCash: number | string,
    premissas: PremissasCalculo = PREMISSAS_PADRAO,
  ): number {
    if (!ehSocio) return paraMoeda(totalCash);

    const parcela = paraDecimal(pr)
      .times(premissas.fatorPep)
      .times(premissas.fatorDiferimento);

    return paraMoeda(paraDecimal(totalCash).plus(parcela));
  }

  /** Delta TC+M{P} x TC+M{A} = (TC+P.Sócios{A} ÷ TC+P.Sócios{P}) − 1. */
  calcularDeltaTcSocios(atual: number | string, anterior: number | string): number | null {
    return this.variacao(atual, anterior);
  }

  // ------------------------------------------------------------------
  // Cálculo consolidado de um participante
  // ------------------------------------------------------------------

  calcularParticipante(
    entrada: EntradaCalculo,
    acrescimos: AcrescimoCalculo[] = [],
    premissas: PremissasCalculo = PREMISSAS_PADRAO,
  ): ResultadoCalculo {
    const fpi = paraFator(entrada.fpi);
    const fd = paraFator(entrada.fd ?? 0);
    const fpiFinal = this.calcularFpiFinal(fpi, fd);

    const vlPrI = this.calcularVlPrI(entrada.calc4, fpi);
    const vlPrF = this.calcularVlPrF(entrada.calc4, fpiFinal);

    const prSem = this.calcularPrSemDiscricionario(vlPrI, acrescimos);
    const prPos = this.calcularPrPosDiscricionario(vlPrF, acrescimos, fd);

    const totalAcrescimoPrI = paraMoeda(
      somar(acrescimos.map((a) => this.calcularAcrescimoSem(a))),
    );
    const totalAcrescimoPrF = paraMoeda(
      somar(acrescimos.map((a) => this.calcularAcrescimoPos(a, fd))),
    );

    const tcAnterior = this.calcularTotalCashComSocios(
      Boolean(entrada.socioAnoAnterior),
      entrada.prAnoAnterior2 ?? 0,
      entrada.totalCashAnoAnterior2 ?? 0,
      premissas,
    );
    const tcAtual = this.calcularTotalCashComSocios(
      Boolean(entrada.socioAno),
      prPos,
      entrada.totalCash ?? 0,
      premissas,
    );

    return {
      fpi,
      fd,
      fpiFinal,
      vlPrI,
      vlPrF,
      prSemDiscricionario: prSem,
      prPosDiscricionario: prPos,
      diferencaDiscricionario: this.calcularDiferencaDiscricionario(prPos, prSem),
      notaPosDiscricionario: this.interpolarNota(fpiFinal, entrada),
      totalAcrescimoPrI,
      totalAcrescimoPrF,
      vlrTeoricoTotal: paraMoeda(
        paraDecimal(entrada.vlrTeorico ?? 0).plus(somar(acrescimos.map((a) => a.vlrTeorico))),
      ),
      percentualRv: this.calcularPercentualRv(prPos, entrada.prAnoAnterior2 ?? null),
      percentualTc: this.calcularPercentualTc(
        entrada.totalCash ?? 0,
        entrada.totalCashAnoAnterior2 ?? null,
      ),
      tcMaisSociosAnterior: tcAnterior,
      tcMaisSociosAtual: tcAtual,
      deltaTcMaisSocios: this.calcularDeltaTcSocios(tcAtual, tcAnterior),
    };
  }

  // ------------------------------------------------------------------
  // Pool
  // ------------------------------------------------------------------

  /** Pool disponível = Σ VLR_TEORICO × percentual (1% por padrão). */
  calcularPoolDisponivel(
    vlrTeoricoTotal: number | string,
    percentual = PREMISSAS_PADRAO.percentualPool,
  ): number {
    return paraMoeda(paraDecimal(vlrTeoricoTotal).times(percentual));
  }

  /**
   * Consolida o pool do comitê.
   * Consumo é a soma algébrica das diferenças (PR pós − PR sem): lançamentos
   * negativos devolvem verba ao pool.
   */
  consolidarPool(
    vlrTeoricoTotal: number | string,
    poolConsumido: number | string,
    percentual = PREMISSAS_PADRAO.percentualPool,
  ): ResultadoPool {
    const disponivel = this.calcularPoolDisponivel(vlrTeoricoTotal, percentual);
    const consumido = paraMoeda(poolConsumido);
    const saldo = paraMoeda(paraDecimal(disponivel).minus(consumido));

    const percentualUtilizado = disponivel
      ? paraDecimal(consumido).dividedBy(disponivel).times(100).toDecimalPlaces(4).toNumber()
      : 0;

    return {
      vlrTeoricoTotal: paraMoeda(vlrTeoricoTotal),
      percentual,
      poolDisponivel: disponivel,
      poolConsumido: consumido,
      saldo,
      percentualUtilizado,
      excedido: saldo < 0,
    };
  }

  // ------------------------------------------------------------------
  // HC por nível de cargo (seção 3.3 / 5.3)
  // ------------------------------------------------------------------

  /** HC Máx. = arredondar para cima (HC Total ÷ divisor). Divisor padrão 3. */
  calcularHcMaximo(hcTotal: number, divisor = PREMISSAS_PADRAO.divisorHcMax): number {
    if (!hcTotal) return 0;
    return Math.ceil(hcTotal / (divisor || 3));
  }

  /** Checagem = "REVER" quando HC c/Disc. > HC Máx.; senão "OK". */
  checar(hcComDiscricionario: number, hcMaximo: number): ResultadoChecagem {
    return hcComDiscricionario > hcMaximo ? ResultadoChecagem.REVER : ResultadoChecagem.OK;
  }

  /** Perf. ponderada por VB = Σ(VLBASEMES × FPI) ÷ Σ(VLBASEMES). */
  calcularPerformancePonderada(
    itens: Array<{ vlBaseMes: number | string; fator: number | string }>,
  ): number | null {
    const peso = somar(itens.map((item) => item.vlBaseMes));
    if (peso.isZero()) return null;

    const produto = itens.reduce(
      (acumulado, item) => acumulado.plus(paraDecimal(item.vlBaseMes).times(paraDecimal(item.fator))),
      new Decimal(0),
    );

    return produto.dividedBy(peso).toDecimalPlaces(6).toNumber();
  }

  // ------------------------------------------------------------------
  // Validações
  // ------------------------------------------------------------------

  /**
   * Valida o FD (seção 3.2 / 7).
   *
   * Aceita positivo, negativo e zero. Acima do limite — do ciclo (±0,15) ou do
   * motivador (SQV, ±0,05) — a operação exige confirmação explícita e o
   * registro fica sinalizado.
   */
  validarFd(
    valor: unknown,
    opcoes: { limiteCiclo: number; limiteMotivo?: number | null; confirmado?: boolean },
  ): { valor: number; foraDoLimite: boolean; limiteAplicado: number } {
    if (valor === null || valor === undefined || valor === '') {
      throw new ExcecaoDiscricionarioInvalido('Valor de discricionário é obrigatório');
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      throw new ExcecaoDiscricionarioInvalido('Valor de discricionário inválido', { valor });
    }

    // Barreira contra erro grosseiro de digitação (ex.: 15 no lugar de 0,15).
    if (Math.abs(numero) > 1) {
      throw new ExcecaoDiscricionarioInvalido(
        'Valor de discricionário inválido: informe o FD em decimal (0,15 = 15pp)',
        { valorInformado: numero },
      );
    }

    // O limite do motivador, quando existe, é sempre o mais restritivo aplicável.
    const limiteAplicado =
      opcoes.limiteMotivo !== null && opcoes.limiteMotivo !== undefined
        ? Math.min(opcoes.limiteMotivo, opcoes.limiteCiclo)
        : opcoes.limiteCiclo;

    const decimal = paraDecimal(numero);
    const foraDoLimite = decimal.abs().greaterThan(limiteAplicado);

    if (foraDoLimite && !opcoes.confirmado) {
      throw new ExcecaoDiscricionarioInvalido(
        `Valor de discricionário fora do limite permitido (${this.formatarPp(
          -limiteAplicado,
        )} a ${this.formatarPp(limiteAplicado)}). Reenvie com "confirmarForaDoLimite": true para registrar mesmo assim.`,
        {
          valorInformado: numero,
          limiteMinimo: -limiteAplicado,
          limiteMaximo: limiteAplicado,
          exigeConfirmacao: true,
        },
      );
    }

    return {
      valor: decimal.toDecimalPlaces(CASAS_FATOR, Decimal.ROUND_HALF_UP).toNumber(),
      foraDoLimite,
      limiteAplicado,
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /** Formata um fator como pontos percentuais (0,15 -> "+15pp"). */
  formatarPp(valor: number | string): string {
    const pp = paraDecimal(valor).times(100).toDecimalPlaces(2).toNumber();
    return `${pp > 0 ? '+' : ''}${pp}pp`;
  }

  /** (atual ÷ anterior) − 1, protegido contra divisão por zero. */
  private variacao(atual: number | string, anterior: number | string | null): number | null {
    const base = paraDecimal(anterior);
    if (base.isZero()) return null;
    return paraDecimal(atual).dividedBy(base).minus(1).toDecimalPlaces(6).toNumber();
  }

  private arredondarNota(valor: number): number {
    return paraDecimal(valor).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
  }
}
