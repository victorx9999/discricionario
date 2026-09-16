import { BadRequestException } from '@nestjs/common';
import { Brackets, SelectQueryBuilder } from 'typeorm';

/**
 * Filtros dinâmicos no formato documentado (seção 9.1):
 *
 *   ?filter=campo:operador:valor
 *
 * Podem ser repetidos (`?filter=a:eq:1&filter=b:gt:2`) e são combinados com AND.
 * Os campos aceitos vêm sempre de uma lista branca por recurso, então nada do
 * que o cliente manda entra na query como SQL.
 */

export const OPERADORES = [
  'eq',
  'ne',
  'like',
  'ilike',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'null',
  'notnull',
  'between',
] as const;

export type OperadorFiltro = (typeof OPERADORES)[number];

export interface FiltroDinamico {
  campo: string;
  operador: OperadorFiltro;
  valor?: string;
}

/** Converte `campo:operador:valor` em um filtro tipado. */
export function interpretarFiltro(expressao: string): FiltroDinamico {
  const partes = expressao.split(':');
  if (partes.length < 2) {
    throw new BadRequestException(
      `Filtro inválido: "${expressao}". Use o formato campo:operador:valor`,
    );
  }

  const [campo, operador, ...resto] = partes;
  if (!OPERADORES.includes(operador as OperadorFiltro)) {
    throw new BadRequestException(
      `Operador inválido: "${operador}". Permitidos: ${OPERADORES.join(', ')}`,
    );
  }

  return {
    campo,
    operador: operador as OperadorFiltro,
    // O valor pode conter ":" (datas, por exemplo) — só os dois primeiros
    // segmentos são estruturais.
    valor: resto.length ? resto.join(':') : undefined,
  };
}

/** Normaliza `?filter=` que pode chegar como string única ou array. */
export function interpretarFiltros(entrada: string | string[] | undefined): FiltroDinamico[] {
  if (!entrada) return [];
  const lista = Array.isArray(entrada) ? entrada : [entrada];
  return lista.filter(Boolean).map(interpretarFiltro);
}

/**
 * Aplica os filtros ao QueryBuilder.
 *
 * @param permitidos mapa `campoDaApi -> caminho.no.queryBuilder`
 */
export function aplicarFiltros<T extends object>(
  qb: SelectQueryBuilder<T>,
  filtros: FiltroDinamico[],
  permitidos: Record<string, string>,
): SelectQueryBuilder<T> {
  filtros.forEach((filtro, indice) => {
    const coluna = permitidos[filtro.campo];
    if (!coluna) {
      throw new BadRequestException(
        `Campo não filtrável: "${filtro.campo}". Permitidos: ${Object.keys(permitidos).join(', ')}`,
      );
    }

    const parametro = `filtro_${indice}`;
    const exigirValor = (): string => {
      if (filtro.valor === undefined || filtro.valor === '') {
        throw new BadRequestException(`O operador "${filtro.operador}" exige um valor`);
      }
      return filtro.valor;
    };

    switch (filtro.operador) {
      case 'eq':
        qb.andWhere(`${coluna} = :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'ne':
        qb.andWhere(`${coluna} <> :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'like':
        qb.andWhere(`${coluna} LIKE :${parametro}`, { [parametro]: `%${exigirValor()}%` });
        break;
      case 'ilike':
        qb.andWhere(`${coluna} ILIKE :${parametro}`, { [parametro]: `%${exigirValor()}%` });
        break;
      case 'gt':
        qb.andWhere(`${coluna} > :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'gte':
        qb.andWhere(`${coluna} >= :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'lt':
        qb.andWhere(`${coluna} < :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'lte':
        qb.andWhere(`${coluna} <= :${parametro}`, { [parametro]: exigirValor() });
        break;
      case 'in': {
        const valores = exigirValor()
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        if (!valores.length) {
          throw new BadRequestException(`O operador "in" exige ao menos um valor`);
        }
        qb.andWhere(`${coluna} IN (:...${parametro})`, { [parametro]: valores });
        break;
      }
      case 'null':
        qb.andWhere(`${coluna} IS NULL`);
        break;
      case 'notnull':
        qb.andWhere(`${coluna} IS NOT NULL`);
        break;
      case 'between': {
        const [de, ate] = exigirValor().split(',');
        if (de === undefined || ate === undefined) {
          throw new BadRequestException(`O operador "between" exige dois valores: between:de,ate`);
        }
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where(`${coluna} >= :${parametro}_de`, { [`${parametro}_de`]: de.trim() })
              .andWhere(`${coluna} <= :${parametro}_ate`, { [`${parametro}_ate`]: ate.trim() });
          }),
        );
        break;
      }
    }
  });

  return qb;
}
