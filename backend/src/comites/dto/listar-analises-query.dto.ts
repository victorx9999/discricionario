import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { StatusAnalise } from '../../common/enums';

/** Filtros da tabela de participantes dentro do comitê. */
export class ListarAnalisesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: StatusAnalise })
  @IsOptional()
  @IsEnum(StatusAnalise)
  status?: StatusAnalise;

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
}
