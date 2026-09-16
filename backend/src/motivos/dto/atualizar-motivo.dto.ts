import { OmitType, PartialType } from '@nestjs/swagger';
import { CriarMotivoDto } from './criar-motivo.dto';

/** O COD_MOTIVADOR é imutável: é a chave usada na base. */
export class AtualizarMotivoDto extends PartialType(OmitType(CriarMotivoDto, ['codigo'] as const)) {}
