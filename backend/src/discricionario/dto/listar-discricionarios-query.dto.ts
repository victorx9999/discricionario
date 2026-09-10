import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';

export class ListarDiscricionariosQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  comiteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  participanteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  analiseId?: string;
}
