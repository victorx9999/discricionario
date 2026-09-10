import { PartialType, OmitType } from '@nestjs/swagger';
import { CriarUsuarioDto } from './criar-usuario.dto';

/** Todos os campos são opcionais; a senha tem endpoint próprio quando necessário. */
export class AtualizarUsuarioDto extends PartialType(OmitType(CriarUsuarioDto, ['email'] as const)) {}
