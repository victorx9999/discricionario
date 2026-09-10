import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { StatusGrupo } from '../../common/enums';

export class ListarGruposQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: StatusGrupo })
  @IsOptional()
  @IsEnum(StatusGrupo)
  status?: StatusGrupo;

  @ApiPropertyOptional({ description: 'Grupos em que o usuário é consultora, backup ou criador' })
  @IsOptional()
  @IsUUID('4')
  responsavelId?: string;
}
