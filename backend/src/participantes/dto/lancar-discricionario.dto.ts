import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Lançamento/edição do discricionário de um participante.
 *
 * Regras aplicadas (seções 3.2 e 7):
 *  - motivador e justificativa são obrigatórios quando o FD é diferente de zero;
 *  - zerar o FD remove automaticamente motivador e justificativa;
 *  - FD acima do limite (do ciclo ou do motivador) exige `confirmarForaDoLimite`;
 *  - estourar o pool é recusado, salvo se a premissa do ciclo permitir.
 */
export class LancarDiscricionarioDto {
  @ApiProperty({
    description: 'FD em decimal. Positivo, negativo ou zero. Limite padrão ±0,15 (±15pp).',
    example: 0.05,
  })
  @Transform(({ value }) => (typeof value === 'string' ? Number(value.replace(',', '.')) : value))
  @IsNumber({ maxDecimalPlaces: 6 }, { message: 'fd deve ser numérico (até 6 casas decimais)' })
  fd: number;

  @ApiPropertyOptional({ description: 'ID do motivador no catálogo' })
  @IsOptional()
  @IsUUID('4', { message: 'motivoId deve ser um UUID' })
  motivoId?: string;

  @ApiPropertyOptional({ description: 'Alternativa ao ID: COD_MOTIVADOR do catálogo', example: 3 })
  @IsOptional()
  @IsInt({ message: 'codMotivador deve ser um número inteiro' })
  codMotivador?: number;

  @ApiPropertyOptional({ description: 'OBSERVACAO_POSCOMITE — justificativa detalhada' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  justificativa?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Confirma um FD acima do limite. O registro fica sinalizado.',
  })
  @IsOptional()
  @IsBoolean()
  confirmarForaDoLimite?: boolean;
}
