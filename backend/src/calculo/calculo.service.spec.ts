import { ExcecaoDiscricionarioInvalido } from '../common/filters';
import { ResultadoChecagem } from '../common/enums';
import { CalculoService, PREMISSAS_PADRAO } from './calculo.service';

describe('CalculoService', () => {
  let servico: CalculoService;

  beforeEach(() => {
    servico = new CalculoService();
  });

  // ------------------------------------------------------------------
  // FPI_FINAL = FPI + FD
  // ------------------------------------------------------------------
  describe('FPI_FINAL', () => {
    it('soma o FD ao FPI', () => {
      expect(servico.calcularFpiFinal(1.1, 0.05)).toBe(1.15);
    });

    it('aceita FD negativo', () => {
      expect(servico.calcularFpiFinal(1.15, -0.15)).toBe(1);
    });

    it('mantém o FPI quando não há FD', () => {
      expect(servico.calcularFpiFinal(0.98, null)).toBe(0.98);
      expect(servico.calcularFpiFinal(0.98, 0)).toBe(0.98);
    });

    it('não acumula erro de ponto flutuante', () => {
      // 0.1 + 0.2 === 0.30000000000000004 em ponto flutuante puro
      expect(servico.calcularFpiFinal(0.1, 0.2)).toBe(0.3);
    });
  });

  // ------------------------------------------------------------------
  // VL_PR_I = CALC4 × FPI   e   VL_PR_F = CALC4 × FPI_FINAL
  // ------------------------------------------------------------------
  describe('VL_PR_I e VL_PR_F', () => {
    it('VL_PR_I = CALC4 × FPI', () => {
      // 500.000 × 1,05 = 525.000
      expect(servico.calcularVlPrI(500_000, 1.05)).toBe(525_000);
    });

    it('VL_PR_F = CALC4 × FPI_FINAL', () => {
      // 500.000 × 1,10 = 550.000
      expect(servico.calcularVlPrF(500_000, 1.1)).toBe(550_000);
    });

    it('sem FD o VL_PR_F é igual ao VL_PR_I', () => {
      const fpiFinal = servico.calcularFpiFinal(1.1, 0);
      expect(servico.calcularVlPrF(193_701.527273, fpiFinal)).toBe(
        servico.calcularVlPrI(193_701.527273, 1.1),
      );
    });

    it('reproduz o exemplo oficial (CALC4 500.000 · FPI 1,05 · FD 0,05)', () => {
      const calculo = servico.calcularParticipante({ fpi: 1.05, fd: 0.05, calc4: 500_000 });

      expect(calculo.fpiFinal).toBe(1.1);
      expect(calculo.vlPrI).toBe(525_000);
      expect(calculo.vlPrF).toBe(550_000);
      expect(calculo.diferencaDiscricionario).toBe(25_000);
    });

    it('reproduz o exemplo da tela (FPI 110% -> 115%)', () => {
      // CALC4 é a base: 193.701,527273 × 1,10 = 213.071,68 (PR sem disc.)
      const calculo = servico.calcularParticipante({
        fpi: 1.1,
        fd: 0.05,
        calc4: 193_701.527273,
      });

      expect(calculo.fpiFinal).toBe(1.15);
      expect(calculo.vlPrI).toBe(213_071.68);
      expect(calculo.vlPrF).toBe(222_756.76);
      expect(calculo.diferencaDiscricionario).toBe(9685.08);
    });
  });

  // ------------------------------------------------------------------
  // PR sem / pós discricionário, com acréscimos
  // ------------------------------------------------------------------
  describe('PR com acréscimos', () => {
    // Exemplo FREDERICO — CALC4 é a base, o PR sai de CALC4 × FPI:
    //   titular:   90.368,481818 × 1,10 =  99.405,33
    //   acréscimo: 14.892,454545 × 1,10 =  16.381,70
    const CALC4_TITULAR = 90_368.481818;
    const acrescimo = { vlrTeorico: 20_000, vlPrI: 16_381.7, calc4: 14_892.454545, fpi: 1.1 };

    it('PR sem discricionário soma o VL_PR_I do acréscimo', () => {
      // 99.405,33 + 16.381,70 = 115.787,03
      expect(servico.calcularPrSemDiscricionario(99_405.33, [acrescimo])).toBe(115_787.03);
    });

    it('PR pós discricionário recalcula o acréscimo com o mesmo FD do titular', () => {
      const calculo = servico.calcularParticipante(
        { fpi: 1.1, fd: 0.05, calc4: CALC4_TITULAR },
        [acrescimo],
      );

      // Titular:   90.368,481818 × 1,15 = 103.923,75
      // Acréscimo: 14.892,454545 × 1,15 =  17.126,32
      expect(calculo.vlPrI).toBe(99_405.33);
      expect(calculo.vlPrF).toBe(103_923.75);
      expect(calculo.totalAcrescimoPrI).toBe(16_381.7);
      expect(calculo.totalAcrescimoPrF).toBe(17_126.32);
      expect(calculo.prSemDiscricionario).toBe(115_787.03);
      expect(calculo.prPosDiscricionario).toBe(121_050.07);
    });

    it('acréscimo sem CALC4/FPI entra pelo valor informado, sem efeito do FD', () => {
      const semBase = { vlrTeorico: 10_000, vlPrI: 5_000, calc4: 0, fpi: 0 };
      const calculo = servico.calcularParticipante({ fpi: 1, fd: 0.1, calc4: 100_000 }, [semBase]);

      expect(calculo.totalAcrescimoPrI).toBe(5_000);
      expect(calculo.totalAcrescimoPrF).toBe(5_000);
    });

    it('o VLR_TEORICO do acréscimo entra na base do pool', () => {
      const calculo = servico.calcularParticipante(
        { fpi: 1, fd: 0, calc4: 100_000, vlrTeorico: 120_000 },
        [acrescimo],
      );

      expect(calculo.vlrTeoricoTotal).toBe(140_000);
    });

    it('sem acréscimos, PR sem e PR pós vêm apenas do titular', () => {
      const calculo = servico.calcularParticipante({ fpi: 1, fd: 0.1, calc4: 100_000 });

      expect(calculo.prSemDiscricionario).toBe(100_000);
      expect(calculo.prPosDiscricionario).toBe(110_000);
      expect(calculo.diferencaDiscricionario).toBe(10_000);
    });
  });

  // ------------------------------------------------------------------
  // Nota interpolada (P1..P5 -> N1..N5)
  // ------------------------------------------------------------------
  describe('nota interpolada', () => {
    const curva = { p1: 0.8, p2: 0.95, p3: 1.1, p4: 1.2, p5: 1.35, n1: 1, n2: 2, n3: 2.5, n4: 3, n5: 4 };

    it('devolve o valor exato quando o FPI_FINAL cai sobre um ponto', () => {
      expect(servico.interpolarNota(1.1, curva)).toBe(2.5);
    });

    it('interpola linearmente entre dois pontos', () => {
      // Meio do caminho entre 1,10 (2,5) e 1,20 (3,0)
      expect(servico.interpolarNota(1.15, curva)).toBe(2.75);
    });

    it('prende ao extremo quando o FPI_FINAL sai da curva', () => {
      expect(servico.interpolarNota(0.5, curva)).toBe(1);
      expect(servico.interpolarNota(2, curva)).toBe(4);
    });

    it('sem curva suficiente devolve null', () => {
      expect(servico.interpolarNota(1.1, {})).toBeNull();
      expect(servico.interpolarNota(1.1, { p1: 1, n1: 2 })).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Comparativos e sócios
  // ------------------------------------------------------------------
  describe('comparativos', () => {
    it('% RV = (PR pós ÷ PR ano anterior) − 1', () => {
      expect(servico.calcularPercentualRv(110_000, 100_000)).toBe(0.1);
    });

    it('% TC = (Total Cash ÷ Total Cash ano anterior) − 1', () => {
      expect(servico.calcularPercentualTc(103_560, 100_000)).toBe(0.0356);
    });

    it('base zero não gera divisão por zero', () => {
      expect(servico.calcularPercentualRv(110_000, 0)).toBeNull();
      expect(servico.calcularPercentualTc(110_000, null)).toBeNull();
    });

    it('não sócio: TC + P.Sócios é o próprio Total Cash', () => {
      expect(servico.calcularTotalCashComSocios(false, 500_000, 300_000)).toBe(300_000);
    });

    it('sócio: soma PR × fator PEP × fator de diferimento', () => {
      // 500.000 × 0,725 × 0,70 = 253.750
      expect(servico.calcularTotalCashComSocios(true, 500_000, 300_000)).toBe(553_750);
    });

    it('usa os fatores do ciclo quando informados', () => {
      const premissas = { ...PREMISSAS_PADRAO, fatorPep: 0.5, fatorDiferimento: 0.5 };
      expect(servico.calcularTotalCashComSocios(true, 400_000, 100_000, premissas)).toBe(200_000);
    });

    it('o cálculo consolidado devolve TC+P.Sócios dos dois anos e o delta', () => {
      const calculo = servico.calcularParticipante({
        fpi: 1,
        fd: 0,
        calc4: 100_000,
        totalCash: 300_000,
        totalCashAnoAnterior2: 300_000,
        prAnoAnterior2: 100_000,
        socioAno: true,
        socioAnoAnterior: false,
      });

      expect(calculo.tcMaisSociosAnterior).toBe(300_000);
      expect(calculo.tcMaisSociosAtual).toBe(350_750);
      expect(calculo.deltaTcMaisSocios).toBeCloseTo(0.169167, 5);
    });
  });

  // ------------------------------------------------------------------
  // Pool
  // ------------------------------------------------------------------
  describe('pool', () => {
    it('pool disponível = 1% do Σ VLR_TEORICO', () => {
      expect(servico.calcularPoolDisponivel(10_000_000)).toBe(100_000);
    });

    it('consolida consumido, saldo e percentual', () => {
      const pool = servico.consolidarPool(10_000_000, 45_000);

      expect(pool.poolDisponivel).toBe(100_000);
      expect(pool.poolConsumido).toBe(45_000);
      expect(pool.saldo).toBe(55_000);
      expect(pool.percentualUtilizado).toBe(45);
      expect(pool.excedido).toBe(false);
    });

    it('marca como excedido quando o saldo fica negativo', () => {
      const pool = servico.consolidarPool(1_000_000, 12_000);

      expect(pool.poolDisponivel).toBe(10_000);
      expect(pool.saldo).toBe(-2_000);
      expect(pool.excedido).toBe(true);
    });

    it('lançamentos negativos devolvem verba ao pool', () => {
      const pool = servico.consolidarPool(10_000_000, 30_000 - 5_000);
      expect(pool.poolConsumido).toBe(25_000);
      expect(pool.saldo).toBe(75_000);
    });

    it('percentual configurável por ciclo', () => {
      expect(servico.calcularPoolDisponivel(10_000_000, 0.02)).toBe(200_000);
    });

    it('pool zerado não gera divisão por zero', () => {
      const pool = servico.consolidarPool(0, 0);
      expect(pool.poolDisponivel).toBe(0);
      expect(pool.percentualUtilizado).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // HC por nível de cargo
  // ------------------------------------------------------------------
  describe('HC máximo e checagem', () => {
    it.each([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 2],
      [6, 2],
      [7, 3],
      [20, 7],
    ])('HC total %i => HC máx %i (teto de 1/3)', (hcTotal, esperado) => {
      expect(servico.calcularHcMaximo(hcTotal)).toBe(esperado);
    });

    it('HC total zero devolve zero', () => {
      expect(servico.calcularHcMaximo(0)).toBe(0);
    });

    it('divisor configurável pelo ciclo', () => {
      expect(servico.calcularHcMaximo(10, 2)).toBe(5);
    });

    it('checagem devolve OK dentro do limite e REVER acima', () => {
      expect(servico.checar(1, 1)).toBe(ResultadoChecagem.OK);
      expect(servico.checar(0, 1)).toBe(ResultadoChecagem.OK);
      expect(servico.checar(2, 1)).toBe(ResultadoChecagem.REVER);
    });
  });

  describe('performance ponderada por VB', () => {
    it('Σ(VLBASEMES × FPI) ÷ Σ(VLBASEMES)', () => {
      const resultado = servico.calcularPerformancePonderada([
        { vlBaseMes: 10_000, fator: 1.1 },
        { vlBaseMes: 30_000, fator: 1.2 },
      ]);
      // (11.000 + 36.000) ÷ 40.000 = 1,175
      expect(resultado).toBe(1.175);
    });

    it('sem peso devolve null', () => {
      expect(servico.calcularPerformancePonderada([])).toBeNull();
      expect(servico.calcularPerformancePonderada([{ vlBaseMes: 0, fator: 1.1 }])).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Validação do FD
  // ------------------------------------------------------------------
  describe('validação do FD', () => {
    const limite = { limiteCiclo: 0.15 };

    it.each([0, 0.15, -0.15, 0.07, -0.015, 0.0001])('aceita %p dentro do limite', (valor) => {
      expect(servico.validarFd(valor, limite).valor).toBe(valor);
      expect(servico.validarFd(valor, limite).foraDoLimite).toBe(false);
    });

    it('recusa acima do limite sem confirmação', () => {
      expect(() => servico.validarFd(0.2, limite)).toThrow(ExcecaoDiscricionarioInvalido);
      expect(() => servico.validarFd(-0.16, limite)).toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('aceita acima do limite quando confirmado e sinaliza o registro', () => {
      const resultado = servico.validarFd(0.2, { ...limite, confirmado: true });

      expect(resultado.valor).toBe(0.2);
      expect(resultado.foraDoLimite).toBe(true);
      expect(resultado.limiteAplicado).toBe(0.15);
    });

    it('o limite do motivador é o mais restritivo (SQV: ±5pp)', () => {
      expect(() => servico.validarFd(0.07, { limiteCiclo: 0.15, limiteMotivo: 0.05 })).toThrow(
        /5pp/,
      );
      expect(servico.validarFd(0.04, { limiteCiclo: 0.15, limiteMotivo: 0.05 }).valor).toBe(0.04);
    });

    it('o limite do motivador nunca afrouxa o limite do ciclo', () => {
      expect(() => servico.validarFd(0.3, { limiteCiclo: 0.15, limiteMotivo: 0.5 })).toThrow(
        ExcecaoDiscricionarioInvalido,
      );
    });

    it('recusa valor não numérico ou ausente', () => {
      expect(() => servico.validarFd('abc', limite)).toThrow(ExcecaoDiscricionarioInvalido);
      expect(() => servico.validarFd(null, limite)).toThrow(ExcecaoDiscricionarioInvalido);
      expect(() => servico.validarFd(undefined, limite)).toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('recusa FD informado em pontos percentuais inteiros (erro de digitação)', () => {
      expect(() => servico.validarFd(15, { ...limite, confirmado: true })).toThrow(/decimal/);
    });

    it('a mensagem cita o limite em pontos percentuais', () => {
      expect(() => servico.validarFd(0.2, limite)).toThrow(/-15pp a \+15pp/);
    });
  });

  describe('formatação', () => {
    it('converte o fator em pontos percentuais', () => {
      expect(servico.formatarPp(0.05)).toBe('+5pp');
      expect(servico.formatarPp(-0.015)).toBe('-1.5pp');
      expect(servico.formatarPp(0)).toBe('0pp');
    });
  });
});
