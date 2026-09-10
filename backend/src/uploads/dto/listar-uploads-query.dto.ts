import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { ModoProcessamento, StatusImportacao, TipoBase } from '../../common/enums';

export class ListarUploadsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: TipoBase })
  @IsOptional()
  @IsEnum(TipoBase)
  tipoBase?: TipoBase;

  @ApiPropertyOptional({ enum: ModoProcessamento })
  @IsOptional()
  @IsEnum(ModoProcessamento)
  modo?: ModoProcessamento;

  @ApiPropertyOptional({ enum: StatusImportacao })
  @IsOptional()
  @IsEnum(StatusImportacao)
  status?: StatusImportacao;
}
