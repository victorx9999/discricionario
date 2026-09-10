import { OmitType, PartialType } from '@nestjs/swagger';
import { CriarGrupoDto } from './criar-grupo.dto';

/** O código do grupo é imutável após a criação. */
export class AtualizarGrupoDto extends PartialType(OmitType(CriarGrupoDto, ['codigo'] as const)) {}
