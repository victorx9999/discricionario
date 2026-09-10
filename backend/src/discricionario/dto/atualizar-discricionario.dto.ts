import { OmitType, PartialType } from '@nestjs/swagger';
import { SalvarDiscricionarioDto } from './salvar-discricionario.dto';

/** No PUT a análise já está determinada pelo ID do discricionário. */
export class AtualizarDiscricionarioDto extends PartialType(
  OmitType(SalvarDiscricionarioDto, ['analiseId'] as const),
) {}
