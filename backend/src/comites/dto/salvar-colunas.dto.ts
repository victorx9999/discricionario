import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ColunaComiteDto {
  @ApiProperty({ example: 'prPosDiscricionario', description: 'Chave do catálogo de colunas' })
  @IsString({ message: 'chave é obrigatória' })
  @MaxLength(60)
  chave: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  visivel?: boolean;

  @ApiPropertyOptional({ description: 'Posição na tabela (0 = primeira)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  ordem?: number;

  @ApiPropertyOptional({ description: 'Largura em pixels' })
  @IsOptional()
  @IsInt()
  @Min(40)
  @Max(1200)
  largura?: number;

  @ApiPropertyOptional({ description: 'Congela a coluna à esquerda' })
  @IsOptional()
  @IsBoolean()
  fixa?: boolean;

  @ApiPropertyOptional({ description: 'Rótulo customizado; nulo usa o do catálogo' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  rotulo?: string;
}

/**
 * Layout da Tabela de Participantes, definido pelo Atendimento ao montar o
 * comitê. A Consultoria abre o comitê já com esta configuração aplicada.
 */
export class SalvarColunasDto {
  @ApiProperty({ type: [ColunaComiteDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe ao menos uma coluna' })
  @ValidateNested({ each: true })
  @Type(() => ColunaComiteDto)
  colunas: ColunaComiteDto[];
}
