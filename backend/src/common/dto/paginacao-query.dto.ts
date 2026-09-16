import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { FiltroDinamico, interpretarFiltros } from './filtro-dinamico';

export type DirecaoOrdenacao = 'ASC' | 'DESC';

/**
 * Query base de todos os endpoints de listagem (convenções da seção 9.1).
 *
 * Paginação: ?page, ?limit, ?sortBy, ?order
 * Filtros dinâmicos: ?filter=campo:operador:valor (repetível)
 * Soft delete: ?withDeleted=true inclui os registros removidos logicamente
 */
export class PaginacaoQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'page deve ser um número inteiro' })
  @Min(1, { message: 'page deve ser maior ou igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'limit deve ser um número inteiro' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1' })
  @Max(500, { message: 'limit não pode ser maior que 500' })
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Termo de busca livre' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({ description: 'Campo de ordenação (lista branca por recurso)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ASC', 'DESC'], { message: 'order deve ser ASC ou DESC' })
  order?: DirecaoOrdenacao = 'ASC';

  @ApiPropertyOptional({
    description: 'Filtro dinâmico campo:operador:valor. Pode ser repetido.',
    example: 'fd:gt:0',
    isArray: true,
    type: String,
  })
  @IsOptional()
  filter?: string | string[];

  @ApiPropertyOptional({ description: 'Inclui registros removidos logicamente', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  withDeleted?: boolean = false;

  @ApiPropertyOptional({
    description: 'Ano do ciclo. Quando omitido, usa o ciclo ativo.',
    example: 2026,
  })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'ciclo deve ser o ano (ex.: 2026)' })
  @Min(2000)
  @Max(2999)
  ciclo?: number;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 50);
  }

  get take(): number {
    return this.limit ?? 50;
  }

  /** Filtros dinâmicos já interpretados. */
  get filtros(): FiltroDinamico[] {
    return interpretarFiltros(this.filter);
  }
}
