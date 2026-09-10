import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Limite do discricionário: ±15pp (±0,15). */
export const LIMITE_DISCRICIONARIO_PADRAO = 0.15;

export class SalvarDiscricionarioDto {
  @ApiProperty({ description: 'Análise (participante dentro do comitê) que receberá o discricionário' })
  @IsUUID('4', { message: 'analiseId deve ser um UUID' })
  analiseId: string;

  @ApiProperty({
    description:
      'Fator discricionário (FD) em decimal. Aceita positivo, negativo ou zero, ' +
      'no intervalo de -0,15 (-15pp) a 0,15 (+15pp). Ex.: 0.07, -0.015, 0',
    example: 0.07,
    minimum: -LIMITE_DISCRICIONARIO_PADRAO,
    maximum: LIMITE_DISCRICIONARIO_PADRAO,
  })
  @Transform(({ value }) => (typeof value === 'string' ? Number(value.replace(',', '.')) : value))
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'valorFd deve ser numérico (até 6 casas decimais)' })
  @Min(-LIMITE_DISCRICIONARIO_PADRAO, { message: 'Valor de discricionário inválido: mínimo -0,15 (-15pp)' })
  @Max(LIMITE_DISCRICIONARIO_PADRAO, { message: 'Valor de discricionário inválido: máximo 0,15 (+15pp)' })
  valorFd: number;

  @ApiPropertyOptional({ description: 'ID da avaliação comportamental selecionada' })
  @IsOptional()
  @IsUUID('4', { message: 'avaliacaoComportamentalId deve ser um UUID' })
  avaliacaoComportamentalId?: string;

  @ApiPropertyOptional({ description: 'Alternativa ao ID: código da avaliação (SQV, TODOS, PERFORMANCE, ...)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  avaliacaoComportamentalCodigo?: string;

  @ApiPropertyOptional({ description: 'Justificativa/observação do lançamento' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  justificativa?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Quando true, a resposta já traz a próxima análise do comitê',
  })
  @IsOptional()
  @IsBoolean()
  avancarParaProximo?: boolean;
}
