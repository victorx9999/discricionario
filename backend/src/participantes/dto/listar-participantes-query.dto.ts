import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';

/**
 * Filtros da listagem de participantes.
 * Além destes, vale o filtro dinâmico `?filter=campo:operador:valor`.
 */
export class ListarParticipantesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome ou funcional (EMPLID)' })
  declare search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  emplid?: string;

  @ApiPropertyOptional({ description: 'Nível do cargo (XLATLONGNAME)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nivelCargo?: string;

  @ApiPropertyOptional({ description: 'Institucional ou Comunidade' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  modeloAvaliacao?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  grupoRanking?: string;

  @ApiPropertyOptional({ description: 'Somente participantes deste comitê' })
  @IsOptional()
  @IsUUID('4', { message: 'comiteId deve ser um UUID' })
  comiteId?: string;

  @ApiPropertyOptional({ description: 'Somente elegíveis ainda sem comitê' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  semComite?: boolean;

  @ApiPropertyOptional({
    enum: ['com', 'sem', 'pendentes'],
    description:
      'com = FD diferente de zero; sem = FD zerado; pendentes = FD lançado sem motivador ou justificativa',
  })
  @IsOptional()
  @IsIn(['com', 'sem', 'pendentes'])
  discricionario?: 'com' | 'sem' | 'pendentes';
}
