import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { StatusComite } from '../../common/enums';

export class ListarComitesQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: StatusComite })
  @IsOptional()
  @IsEnum(StatusComite)
  status?: StatusComite;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  grupoId?: string;
}
