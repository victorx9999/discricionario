import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Inclusão/remoção em lote de participantes do grupo. */
export class GerenciarParticipantesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Informe ao menos um participante' })
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'participanteIds deve conter UUIDs' })
  participanteIds: string[];
}
