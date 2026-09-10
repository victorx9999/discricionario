import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type DirecaoOrdenacao = 'ASC' | 'DESC';

/**
 * Query base para todos os endpoints paginados.
 * A paginação é sempre resolvida no banco — nunca em memória.
 */
export class PaginacaoQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Página (base 1)' })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'page deve ser um número inteiro' })
  @Min(1, { message: 'page deve ser maior ou igual a 1' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500, description: 'Registros por página' })
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

  @ApiPropertyOptional({ description: 'Campo de ordenação' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['ASC', 'DESC'], { message: 'sortOrder deve ser ASC ou DESC' })
  sortOrder?: DirecaoOrdenacao = 'ASC';

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 50);
  }

  get take(): number {
    return this.limit ?? 50;
  }
}
