import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Premissas vigentes do ciclo (seção 10).
 * Alterar aqui não afeta ciclos anteriores — cada ano guarda as suas.
 */
export class AtualizarPremissasDto {
  @ApiPropertyOptional({ example: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'percentualPool deve ser numérico' })
  @Min(0)
  @Max(1)
  percentualPool?: number;

  @ApiPropertyOptional({ example: 0.15 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'limiteFd deve ser numérico' })
  @Min(0)
  @Max(1)
  limiteFd?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'true: lançamento que estoura o pool é recusado. false: aceito e sinalizado, com confirmação ao concluir.',
  })
  @IsOptional()
  @IsBoolean()
  bloquearPoolExcedido?: boolean;

  @ApiPropertyOptional({ example: 3, description: 'HC Máx. = teto(HC Total ÷ divisor)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  divisorHcMax?: number;

  @ApiPropertyOptional({ example: 0.725 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(10)
  fatorPep?: number;

  @ApiPropertyOptional({ example: 0.7 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(10)
  fatorDiferimento?: number;

  @ApiPropertyOptional({ example: 'Institucional' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tipoSimuladorPerformance?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  motivoObrigatorio?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ataObrigatoria?: boolean;

  @ApiPropertyOptional({ example: 'Ciclo 2027' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  descricao?: string;
}
