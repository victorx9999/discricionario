import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CriarMotivoDto {
  @ApiProperty({ example: 3, description: 'COD_MOTIVADOR usado na base' })
  @IsInt({ message: 'codigo deve ser um número inteiro' })
  @Min(1)
  codigo: number;

  @ApiProperty({ example: 'SQV (com impacto limitado a +/- 5pp)' })
  @IsString({ message: 'descricao é obrigatória' })
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descricao: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  detalhe?: string;

  @ApiPropertyOptional({
    example: 0.05,
    description: 'Limite de FD próprio deste motivador. Quando ausente, vale o limite do ciclo.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(1)
  limiteFd?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  exigeJustificativa?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  ordem?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
