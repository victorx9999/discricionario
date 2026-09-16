import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TipoComite } from '../../common/enums';

export class CriarComiteDto {
  @ApiProperty({ example: '100702', description: 'Código do grupo' })
  @IsString({ message: 'codigo é obrigatório' })
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  codigo: string;

  @ApiProperty({ example: 'WMS PRIVATE', description: 'Nome do grupo' })
  @IsString({ message: 'nome é obrigatório' })
  @MinLength(2)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiPropertyOptional({ example: 2027, description: 'Ciclo do comitê. Omitido, usa o ativo.' })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(2000)
  @Max(2999)
  ciclo?: number;

  @ApiPropertyOptional({ example: 'Private Banking' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional({ enum: TipoComite, default: TipoComite.MISTO })
  @IsOptional()
  @IsEnum(TipoComite)
  tipo?: TipoComite;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Consultorias responsáveis. Aceita múltiplos nomes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'consultoriaIds deve conter UUIDs' })
  consultoriaIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Atendimentos de backup. Aceita múltiplos nomes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'backupIds deve conter UUIDs' })
  backupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Participantes selecionados na tabela' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'participanteIds deve conter UUIDs' })
  participanteIds?: string[];
}
