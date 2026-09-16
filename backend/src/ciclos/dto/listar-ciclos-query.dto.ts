import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { StatusCiclo } from '../../common/enums';

export class ListarCiclosQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: StatusCiclo })
  @IsOptional()
  @IsEnum(StatusCiclo)
  status?: StatusCiclo;
}
