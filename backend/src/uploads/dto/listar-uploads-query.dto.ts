import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { ModoCarga, StatusImportacao, TipoBase } from '../../common/enums';

export class ListarUploadsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: TipoBase })
  @IsOptional()
  @IsEnum(TipoBase)
  tipoBase?: TipoBase;

  @ApiPropertyOptional({ enum: ModoCarga })
  @IsOptional()
  @IsEnum(ModoCarga)
  modo?: ModoCarga;

  @ApiPropertyOptional({ enum: StatusImportacao })
  @IsOptional()
  @IsEnum(StatusImportacao)
  status?: StatusImportacao;
}
