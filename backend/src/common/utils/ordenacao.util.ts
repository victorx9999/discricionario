import { BadRequestException } from '@nestjs/common';

/**
 * Resolve o campo de ordenação contra uma lista branca.
 *
 * Impede injeção de SQL via `sortBy` e devolve o caminho real da coluna
 * (ex.: `participante.nome`) usado no QueryBuilder.
 */
export function resolverOrdenacao(
  sortBy: string | undefined,
  permitidos: Record<string, string>,
  padrao: string,
): string {
  if (!sortBy) {
    return permitidos[padrao] ?? padrao;
  }
  const coluna = permitidos[sortBy];
  if (!coluna) {
    throw new BadRequestException(
      `Campo de ordenação inválido: "${sortBy}". Permitidos: ${Object.keys(permitidos).join(', ')}`,
    );
  }
  return coluna;
}

/** Normaliza a direção de ordenação. */
export function resolverDirecao(sortOrder: string | undefined): 'ASC' | 'DESC' {
  return String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}
