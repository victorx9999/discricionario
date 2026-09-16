import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CriarCicloDto {
  @ApiProperty({ example: 2027, description: 'Ano-base do ciclo' })
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'ano deve ser um número inteiro' })
  @Min(2000)
  @Max(2999)
  ano: number;

  @ApiPropertyOptional({ example: 'Ciclo 2027' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  descricao?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Torna este o ciclo ativo (desativa o anterior)',
  })
  @IsOptional()
  @IsBoolean()
  ativar?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Copia as premissas do ciclo anterior em vez de usar os padrões',
  })
  @IsOptional()
  @IsBoolean()
  herdarPremissas?: boolean;

  @ApiPropertyOptional({ example: 0.01, description: 'Percentual do pool (1% = 0.01)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  percentualPool?: number;

  @ApiPropertyOptional({ example: 0.15, description: 'Limite do FD (15pp = 0.15)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  limiteFd?: number;
}
