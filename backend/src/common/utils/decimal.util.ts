import Decimal from 'decimal.js';

/**
 * Utilitários numéricos.
 *
 * Todo cálculo financeiro do sistema passa por aqui para evitar os erros de
 * ponto flutuante do `number` nativo. Os valores são persistidos como
 * `numeric` no Postgres (e lidos como string pelo driver `pg`), por isso as
 * conversões abaixo aceitam `string | number | null`.
 */

/** Casas decimais usadas para valores monetários. */
export const CASAS_MONETARIAS = 2;

/** Casas decimais usadas para fatores (FPI, FBPA, FD). */
export const CASAS_FATOR = 6;

export type ValorNumerico = string | number | Decimal | null | undefined;

/** Converte com segurança qualquer entrada em `Decimal`. Nulos viram 0. */
export function paraDecimal(valor: ValorNumerico): Decimal {
  if (valor === null || valor === undefined || valor === '') {
    return new Decimal(0);
  }
  if (valor instanceof Decimal) {
    return valor;
  }
  const decimal = new Decimal(typeof valor === 'string' ? normalizarTexto(valor) : valor);
  return decimal.isFinite() ? decimal : new Decimal(0);
}

/** Converte para `number` já arredondado às casas monetárias. */
export function paraMoeda(valor: ValorNumerico): number {
  return paraDecimal(valor).toDecimalPlaces(CASAS_MONETARIAS, Decimal.ROUND_HALF_UP).toNumber();
}

/** Converte para `number` já arredondado às casas de fator. */
export function paraFator(valor: ValorNumerico): number {
  return paraDecimal(valor).toDecimalPlaces(CASAS_FATOR, Decimal.ROUND_HALF_UP).toNumber();
}

/** Soma uma lista de valores heterogêneos com precisão decimal. */
export function somar(valores: ValorNumerico[]): Decimal {
  return valores.reduce<Decimal>((acumulado, atual) => acumulado.plus(paraDecimal(atual)), new Decimal(0));
}

/**
 * Normaliza texto numérico vindo de CSV.
 * Aceita "1.234,56", "1234.56", "R$ 1.234,56", "12%", "(100)" (negativo contábil).
 */
export function normalizarTexto(texto: string): string {
  let limpo = texto.trim();
  if (!limpo) return '0';

  let negativo = false;
  if (/^\(.*\)$/.test(limpo)) {
    negativo = true;
    limpo = limpo.slice(1, -1);
  }

  limpo = limpo.replace(/[R$\s%]/gi, '');

  const temVirgula = limpo.includes(',');
  const temPonto = limpo.includes('.');

  if (temVirgula && temPonto) {
    // O separador decimal é o que aparece por último.
    if (limpo.lastIndexOf(',') > limpo.lastIndexOf('.')) {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
      limpo = limpo.replace(/,/g, '');
    }
  } else if (temVirgula) {
    limpo = limpo.replace(',', '.');
  }

  if (negativo && !limpo.startsWith('-')) {
    limpo = `-${limpo}`;
  }
  return limpo;
}

/**
 * Interpreta um texto de CSV como número.
 * Retorna `null` quando o conteúdo não é numérico (para registrar o erro na importação).
 */
export function interpretarNumero(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined || String(texto).trim() === '') {
    return null;
  }
  const normalizado = normalizarTexto(String(texto));
  if (!/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(normalizado)) {
    return null;
  }
  const decimal = new Decimal(normalizado);
  return decimal.isFinite() ? decimal.toNumber() : null;
}

/** Transformer do TypeORM para colunas `numeric` — devolve `number` no lugar de `string`. */
export const transformadorNumerico = {
  to: (valor: number | null): number | null => valor ?? null,
  from: (valor: string | null): number | null => (valor === null || valor === undefined ? null : Number(valor)),
};

export { Decimal };
