import { interpretarNumero, normalizarTexto, paraDecimal, paraMoeda, somar } from './decimal.util';

describe('decimal.util', () => {
  describe('normalizarTexto', () => {
    it.each([
      ['1.234,56', '1234.56'],
      ['1,234.56', '1234.56'],
      ['1234,56', '1234.56'],
      ['1234.56', '1234.56'],
      ['R$ 1.234,56', '1234.56'],
      ['12%', '12'],
      ['(100)', '-100'],
      ['  42 ', '42'],
    ])('normaliza %j em %j', (entrada, esperado) => {
      expect(normalizarTexto(entrada)).toBe(esperado);
    });
  });

  describe('interpretarNumero', () => {
    it('converte números em formato brasileiro', () => {
      expect(interpretarNumero('1.234,56')).toBe(1234.56);
      expect(interpretarNumero('-0,15')).toBe(-0.15);
    });

    it('devolve null para conteúdo não numérico', () => {
      expect(interpretarNumero('abc')).toBeNull();
      expect(interpretarNumero('12abc')).toBeNull();
      expect(interpretarNumero('')).toBeNull();
      expect(interpretarNumero(null)).toBeNull();
      expect(interpretarNumero(undefined)).toBeNull();
    });
  });

  describe('precisão', () => {
    it('soma valores sem erro de ponto flutuante', () => {
      // 0.1 + 0.2 + 0.3 em ponto flutuante puro dá 0.6000000000000001
      expect(somar([0.1, 0.2, 0.3]).toNumber()).toBe(0.6);
    });

    it('soma valores vindos do driver do Postgres (strings)', () => {
      expect(somar(['1000.55', '2000.45', null]).toNumber()).toBe(3001);
    });

    it('arredonda meio para cima nos valores monetários', () => {
      expect(paraMoeda(10.005)).toBe(10.01);
      expect(paraMoeda('10.004')).toBe(10);
    });

    it('trata nulos como zero', () => {
      expect(paraDecimal(null).toNumber()).toBe(0);
      expect(paraDecimal(undefined).toNumber()).toBe(0);
      expect(paraDecimal('').toNumber()).toBe(0);
    });
  });
});
