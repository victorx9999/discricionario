import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { PerfilUsuario } from '../../common/enums';

/** Payload do usuário autenticado, anexado à request pelo JwtStrategy. */
export interface UsuarioAutenticado {
  id: string;
  email: string;
  nome: string;
  perfil: PerfilUsuario;
}

/** Injeta o usuário autenticado no handler do controller. */
export const UsuarioAtual = createParamDecorator(
  (campo: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado | undefined = request.user;
    return campo ? usuario?.[campo] : usuario;
  },
);
