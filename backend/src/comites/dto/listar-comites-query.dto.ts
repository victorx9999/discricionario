import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { StatusComite, TipoComite } from '../../common/enums';

export class ListarComitesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: StatusComite })
  @IsOptional()
  @IsEnum(StatusComite)
  status?: StatusComite;

  @ApiPropertyOptional({ enum: TipoComite })
  @IsOptional()
  @IsEnum(TipoComite)
  tipo?: TipoComite;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  area?: string;

  @ApiPropertyOptional({ description: 'Comitês de um responsável específico' })
  @IsOptional()
  @IsUUID('4')
  responsavelId?: string;

  @ApiPropertyOptional({ description: 'Somente comitês sem ATA cadastrada' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  semAta?: boolean;
}
