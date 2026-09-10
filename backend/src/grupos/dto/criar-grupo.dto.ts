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
import { StatusGrupo } from '../../common/enums';

export class CriarGrupoDto {
  @ApiProperty({ example: 'Comitê Tecnologia 2026' })
  @IsString({ message: 'nome é obrigatório' })
  @MinLength(3, { message: 'nome deve ter ao menos 3 caracteres' })
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiProperty({ example: 'GRP-TEC-2026' })
  @IsString({ message: 'codigo é obrigatório' })
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  codigo: string;

  @ApiPropertyOptional({ enum: StatusGrupo, default: StatusGrupo.ATIVO })
  @IsOptional()
  @IsEnum(StatusGrupo, { message: 'status inválido' })
  status?: StatusGrupo;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string;

  @ApiPropertyOptional({ type: [String], description: 'Consultoras responsáveis (pode ser mais de uma)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique({ message: 'consultoraIds não pode ter repetições' })
  @IsUUID('4', { each: true, message: 'consultoraIds deve conter UUIDs' })
  consultoraIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Atendimentos de backup (pode ser mais de um)' })
  @IsOptional()
  @IsArray()
  @ArrayUnique({ message: 'backupIds não pode ter repetições' })
  @IsUUID('4', { each: true, message: 'backupIds deve conter UUIDs' })
  backupIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Participantes selecionados na tabela' })
  @IsOptional()
  @IsArray()
  @ArrayUnique({ message: 'participanteIds não pode ter repetições' })
  @IsUUID('4', { each: true, message: 'participanteIds deve conter UUIDs' })
  participanteIds?: string[];
}
