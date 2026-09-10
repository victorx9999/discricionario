import { ExcecaoDiscricionarioInvalido } from '../../common/filters';
import { CalculoService } from './calculo.service';

describe('CalculoService', () => {
  let servico: CalculoService;

  beforeEach(() => {
    servico = new CalculoService();
  });

  describe('FPI_FINAL', () => {
    it('soma o FD ao FPI', () => {
      expect(servico.calcularFpiFinal(1.1, 0.07)).toBe(1.17);
    });

    it('aceita FD negativo', () => {
      expect(servico.calcularFpiFinal(1.1, -0.15)).toBe(0.95);
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

  describe('PR inicial e final', () => {
    it('PR_INICIAL = VALORBASE x FBPA x FPI', () => {
      expect(servico.calcularPrInicial(10000, 1, 1.2)).toBe(12000);
      expect(servico.calcularPrInicial(8500, 0.9, 1.1)).toBe(8415);
    });

    it('PR_FINAL = VALORBASE x FBPA x FPI_FINAL', () => {
      const fpiFinal = servico.calcularFpiFinal(1.2, 0.05);
      expect(servico.calcularPrFinal(10000, 1, fpiFinal)).toBe(12500);
    });

    it('arredonda valores monetários para 2 casas', () => {
      // 1234.567 x 1.005 x 1.0033 = 1244.8342764555 -> 1244.83
      expect(servico.calcularPrInicial(1234.567, 1.005, 1.0033)).toBe(1244.83);
    });

    it('calcula o conjunto completo de um participante', () => {
      const resultado = servico.calcularParticipante({
        valorBase: 10000,
        fbpa: 1,
        fpi: 1.2,
        fd: 0.05,
      });

      expect(resultado).toEqual({
        fpi: 1.2,
        fd: 0.05,
        fpiFinal: 1.25,
        valorPrI: 12000,
        valorPrF: 12500,
        impactoFinanceiro: 500,
      });
    });

    it('impacto negativo quando o FD é negativo', () => {
      const resultado = servico.calcularParticipante({
        valorBase: 10000,
        fbpa: 1,
        fpi: 1.2,
        fd: -0.05,
      });

      expect(resultado.fpiFinal).toBe(1.15);
      expect(resultado.valorPrF).toBe(11500);
      expect(resultado.impactoFinanceiro).toBe(-500);
    });

    it('mantém PR inicial e final separados, sem sobrescrever o inicial', () => {
      const resultado = servico.calcularParticipante({ valorBase: 5000, fbpa: 1, fpi: 1, fd: 0.1 });
      expect(resultado.valorPrI).toBe(5000);
      expect(resultado.valorPrF).toBe(5500);
    });
  });

  describe('acréscimos (visão anual)', () => {
    it('soma os acréscimos ao VL_PR_I e VL_PR_F', () => {
      const resultado = servico.aplicarAcrescimos(10000, 11000, [
        { valorAcrescimoPrI: 1500, valorAcrescimoPrF: 1600 },
        { valorAcrescimoPrI: 500.55, valorAcrescimoPrF: 600.45 },
      ]);

      expect(resultado.valorPrIAnual).toBe(12000.55);
      expect(resultado.valorPrFAnual).toBe(13200.45);
      expect(resultado.totalAcrescimoPrI).toBe(2000.55);
      expect(resultado.totalAcrescimoPrF).toBe(2200.45);
    });

    it('sem acréscimos, os valores anuais são iguais aos originais', () => {
      const resultado = servico.aplicarAcrescimos(9000, 9500, []);
      expect(resultado.valorPrIAnual).toBe(9000);
      expect(resultado.valorPrFAnual).toBe(9500);
    });
  });

  describe('pool', () => {
    it('POOL = 1% do VLRTEORICO total do grupo', () => {
      expect(servico.calcularPoolTotal(10_000_000)).toBe(100_000);
    });

    it('consolida utilizado, disponível e percentual', () => {
      const pool = servico.consolidarPool(10_000_000, [30_000, 20_000, -5_000]);

      expect(pool.poolTotal).toBe(100_000);
      expect(pool.totalPositivo).toBe(50_000);
      expect(pool.totalNegativo).toBe(5_000);
      expect(pool.poolUtilizado).toBe(45_000);
      expect(pool.poolDisponivel).toBe(55_000);
      expect(pool.percentualUtilizado).toBe(45);
    });

    it('pool zerado não gera divisão por zero', () => {
      const pool = servico.consolidarPool(0, []);
      expect(pool.poolTotal).toBe(0);
      expect(pool.percentualUtilizado).toBe(0);
    });

    it('aceita totais já agregados pelo banco (strings do driver pg)', () => {
      const pool = servico.consolidarPoolAgregado('10000000.00', '50000.00', '5000.00');
      expect(pool.poolUtilizado).toBe(45_000);
      expect(pool.poolDisponivel).toBe(55_000);
    });
  });

  describe('validação do discricionário', () => {
    it.each([0, 0.15, -0.15, 0.07, -0.015, 0.0001])('aceita %p', (valor) => {
      expect(servico.validarValorFd(valor)).toBe(valor);
    });

    it.each([0.16, -0.16, 1, -1, 0.150001])('rejeita %p', (valor) => {
      expect(() => servico.validarValorFd(valor)).toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('rejeita valor não numérico', () => {
      expect(() => servico.validarValorFd('abc')).toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('rejeita valor ausente', () => {
      expect(() => servico.validarValorFd(null)).toThrow(ExcecaoDiscricionarioInvalido);
      expect(() => servico.validarValorFd(undefined)).toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('mensagem de erro cita o limite em pontos percentuais', () => {
      expect(() => servico.validarValorFd(0.2)).toThrow(/-15pp a \+15pp/);
    });
  });

  describe('formatação', () => {
    it('converte o fator em pontos percentuais', () => {
      expect(servico.formatarPp(0.07)).toBe('+7pp');
      expect(servico.formatarPp(-0.015)).toBe('-1.5pp');
      expect(servico.formatarPp(0)).toBe('0pp');
    });
  });
});
