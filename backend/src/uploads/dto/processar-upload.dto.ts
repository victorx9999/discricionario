import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ModoProcessamento, TipoBase } from '../../common/enums';

export class ProcessarUploadDto {
  @ApiProperty({
    enum: TipoBase,
    description: 'PRINCIPAL = base de participantes; ACRESCIMO = complementos por área de origem',
  })
  @IsEnum(TipoBase, { message: 'tipoBase deve ser PRINCIPAL ou ACRESCIMO' })
  tipoBase: TipoBase;

  @ApiProperty({
    enum: ModoProcessamento,
    description:
      'COMPLETO substitui os dados (na base principal também limpa grupos e comitês); ' +
      'INCREMENTAL apenas atualiza/insere',
  })
  @IsEnum(ModoProcessamento, { message: 'modo deve ser COMPLETO ou INCREMENTAL' })
  modo: ModoProcessamento;
}
