import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AtaParticipanteDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString({ message: 'nome do participante da ATA é obrigatório' })
  @MaxLength(150)
  nome: string;

  @ApiPropertyOptional({ example: 'Consultoria responsável' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  papel?: string;

  @ApiPropertyOptional({ description: 'Quando o presente é usuário do sistema' })
  @IsOptional()
  @IsUUID('4')
  usuarioId?: string;
}

/**
 * ATA do comitê. Data, horário de início/fim e ao menos um participante são
 * exigidos para concluir o comitê (seção 3.7).
 */
export class SalvarAtaDto {
  @ApiPropertyOptional({ example: '2026-03-18', description: 'Data única da reunião' })
  @IsOptional()
  @IsDateString({}, { message: 'data deve estar no formato aaaa-mm-dd' })
  data?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'horaInicio deve estar no formato HH:mm' })
  horaInicio?: string;

  @ApiPropertyOptional({ example: '15:30' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}(:\d{2})?$/, { message: 'horaFim deve estar no formato HH:mm' })
  horaFim?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  observacoes?: string;

  @ApiPropertyOptional({ type: [Object], description: '[{ nome, url, tamanho }]' })
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  anexos?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ type: [AtaParticipanteDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AtaParticipanteDto)
  participantes?: AtaParticipanteDto[];
}
