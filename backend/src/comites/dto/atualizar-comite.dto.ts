import { OmitType, PartialType } from '@nestjs/swagger';
import { CriarComiteDto } from './criar-comite.dto';

/** Código e grupo do comitê são imutáveis após a criação. */
export class AtualizarComiteDto extends PartialType(
  OmitType(CriarComiteDto, ['codigo', 'grupoId', 'participanteIds'] as const),
) {}
