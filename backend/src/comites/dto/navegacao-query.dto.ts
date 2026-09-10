import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** Direções de navegação entre participantes do comitê. */
export enum DirecaoNavegacao {
  PRIMEIRO = 'primeiro',
  ANTERIOR = 'anterior',
  PROXIMO = 'proximo',
  ULTIMO = 'ultimo',
}

export class NavegacaoQueryDto {
  @ApiProperty({ enum: DirecaoNavegacao })
  @IsEnum(DirecaoNavegacao, {
    message: 'direcao deve ser primeiro, anterior, proximo ou ultimo',
  })
  direcao: DirecaoNavegacao;

  @ApiPropertyOptional({ description: 'Análise atual — obrigatória para anterior/proximo' })
  @IsOptional()
  @IsUUID('4')
  analiseId?: string;

  @ApiPropertyOptional({ description: 'Alternativa ao analiseId: posição atual na navegação' })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  ordem?: number;
}
