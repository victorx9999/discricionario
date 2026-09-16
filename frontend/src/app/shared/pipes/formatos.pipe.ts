import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formatadores de exibição.
 *
 * Nenhum deles faz conta: os valores já chegam calculados da API. Aqui só se
 * decide como o número aparece na tela.
 */

const LOCALE = 'pt-BR';

@Pipe({ name: 'moeda', standalone: true })
export class MoedaPipe implements PipeTransform {
  transform(valor: number | string | null | undefined, comSinal = false): string {
    const numero = paraNumero(valor);
    if (numero === null) return '—';
    const sinal = comSinal && numero > 0 ? '+' : '';
    return (
      sinal +
      numero.toLocaleString(LOCALE, {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
}

/** Fatores (FPI, FPBA, FPI_FINAL) com quatro casas, como a documentação mostra. */
@Pipe({ name: 'fator', standalone: true })
export class FatorPipe implements PipeTransform {
  transform(valor: number | string | null | undefined, casas = 4): string {
    const numero = paraNumero(valor);
    if (numero === null) return '—';
    return numero.toLocaleString(LOCALE, {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
  }
}

/** FD em pontos percentuais: 0,05 vira "+5pp". */
@Pipe({ name: 'pontosPercentuais', standalone: true })
export class PontosPercentuaisPipe implements PipeTransform {
  transform(valor: number | string | null | undefined): string {
    const numero = paraNumero(valor);
    if (numero === null) return '—';
    if (numero === 0) return '0pp';

    const pontos = numero * 100;
    const sinal = pontos > 0 ? '+' : '';
    const texto = pontos.toLocaleString(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return `${sinal}${texto}pp`;
  }
}

/** Variações (%RV, %TC, delta) — o valor vem como fração: 0,1584 vira "+15,84%". */
@Pipe({ name: 'variacao', standalone: true })
export class VariacaoPipe implements PipeTransform {
  transform(valor: number | string | null | undefined, casas = 2): string {
    const numero = paraNumero(valor);
    if (numero === null) return '—';
    const percentual = numero * 100;
    const sinal = percentual > 0 ? '+' : '';
    return (
      sinal +
      percentual.toLocaleString(LOCALE, {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      }) +
      '%'
    );
  }
}

/** Percentuais que já vêm em escala 0–100 (uso do pool, por exemplo). */
@Pipe({ name: 'percentual', standalone: true })
export class PercentualPipe implements PipeTransform {
  transform(valor: number | string | null | undefined, casas = 1): string {
    const numero = paraNumero(valor);
    if (numero === null) return '—';
    return (
      numero.toLocaleString(LOCALE, {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      }) + '%'
    );
  }
}

@Pipe({ name: 'dataBr', standalone: true })
export class DataBrPipe implements PipeTransform {
  transform(valor: string | Date | null | undefined, comHora = false): string {
    if (!valor) return '—';
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return '—';

    const dia = data.toLocaleDateString(LOCALE);
    if (!comHora) return dia;
    return `${dia} ${data.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
  }
}

/**
 * Formata uma célula segundo o tipo declarado no catálogo de colunas.
 * É o que faz a tabela dinâmica funcionar com 49 campos sem um `switch` no HTML.
 */
@Pipe({ name: 'celula', standalone: true })
export class CelulaPipe implements PipeTransform {
  private readonly moeda = new MoedaPipe();
  private readonly fator = new FatorPipe();
  private readonly pp = new PontosPercentuaisPipe();
  private readonly variacao = new VariacaoPipe();
  private readonly data = new DataBrPipe();

  transform(valor: unknown, tipo: string): string {
    if (valor === null || valor === undefined || valor === '') return '—';

    switch (tipo) {
      case 'moeda':
        return this.moeda.transform(valor as number);
      case 'fator':
        return this.fator.transform(valor as number);
      case 'pontosPercentuais':
        return typeof valor === 'string' ? valor : this.pp.transform(valor as number);
      case 'percentual':
        return this.variacao.transform(valor as number);
      case 'numero':
        return Number(valor).toLocaleString(LOCALE, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      case 'data':
        return this.data.transform(valor as string);
      case 'booleano':
        return valor ? 'Sim' : 'Não';
      default:
        return String(valor);
    }
  }
}

/** Tipos que a tabela alinha à direita. */
export const TIPOS_NUMERICOS = new Set([
  'moeda',
  'fator',
  'numero',
  'percentual',
  'pontosPercentuais',
]);

function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}
