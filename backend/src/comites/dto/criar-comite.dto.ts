import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StatusComite } from '../../common/enums';

export class CriarComiteDto {
  @ApiProperty({ example: 'Comitê Tecnologia — Ciclo 2026' })
  @IsString({ message: 'nome é obrigatório' })
  @MinLength(3)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiProperty({ example: 'COM-TEC-2026' })
  @IsString({ message: 'codigo é obrigatório' })
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  codigo: string;

  @ApiProperty({ description: 'Grupo que fornece os participantes do comitê' })
  @IsUUID('4', { message: 'grupoId deve ser um UUID' })
  grupoId: string;

  @ApiPropertyOptional({ enum: StatusComite, default: StatusComite.RASCUNHO })
  @IsOptional()
  @IsEnum(StatusComite, { message: 'status inválido' })
  status?: StatusComite;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Subconjunto de participantes do grupo. Quando omitido, entram todos.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  participanteIds?: string[];
}
