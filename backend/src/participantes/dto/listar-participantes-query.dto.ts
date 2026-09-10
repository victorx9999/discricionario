import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';

/**
 * Filtros da listagem de participantes.
 * Todos são aplicados no banco — a API nunca devolve a base inteira.
 */
export class ListarParticipantesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome ou matrícula/funcional' })
  declare search?: string;

  @ApiPropertyOptional({ description: 'Filtra por matrícula/funcional exata' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  funcional?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  cargo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nivelCargo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modeloAvaliacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  areaOrigem?: string;

  @ApiPropertyOptional({ description: 'Somente participantes deste grupo' })
  @IsOptional()
  @IsUUID('4', { message: 'grupoId deve ser um UUID' })
  grupoId?: string;

  @ApiPropertyOptional({ description: 'Exclui os participantes já vinculados a este grupo' })
  @IsOptional()
  @IsUUID('4', { message: 'foraDoGrupoId deve ser um UUID' })
  foraDoGrupoId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  ativo?: boolean;
}
