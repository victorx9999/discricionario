import { SetMetadata } from '@nestjs/common';
import { PerfilUsuario } from '../../common/enums';

export const CHAVE_PERFIS = 'perfis_permitidos';

/** Restringe a rota aos perfis informados. */
export const Perfis = (...perfis: PerfilUsuario[]) => SetMetadata(CHAVE_PERFIS, perfis);
