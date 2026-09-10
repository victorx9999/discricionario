import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '../../common/enums';
import { CHAVE_PERFIS } from '../decorators/perfis.decorator';
import { CHAVE_PUBLICO } from '../decorators/publico.decorator';
import { UsuarioAutenticado } from '../decorators/usuario-atual.decorator';

/** Controle de acesso por perfil (ADMIN / ATENDIMENTO / CONSULTORIA). */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const publico = this.reflector.getAllAndOverride<boolean>(CHAVE_PUBLICO, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publico) return true;

    const perfisPermitidos = this.reflector.getAllAndOverride<PerfilUsuario[]>(CHAVE_PERFIS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!perfisPermitidos?.length) return true;

    const usuario: UsuarioAutenticado | undefined = context.switchToHttp().getRequest().user;
    if (!usuario) return false;

    // ADMIN tem acesso irrestrito.
    if (usuario.perfil === PerfilUsuario.ADMIN) return true;

    if (!perfisPermitidos.includes(usuario.perfil)) {
      throw new ForbiddenException(
        `Acesso negado. Perfis permitidos: ${perfisPermitidos.join(', ')}`,
      );
    }
    return true;
  }
}
