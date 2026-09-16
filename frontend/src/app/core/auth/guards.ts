import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PerfilUsuario } from '../models/api.models';
import { AuthService } from './auth.service';

/** Exige sessão válida; sem ela, manda para o login guardando o destino. */
export const authGuard: CanActivateFn = (_rota, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.autenticado()) return true;

  return router.createUrlTree(['/login'], { queryParams: { destino: estado.url } });
};

/**
 * Exige um dos perfis informados na rota (`data.perfis`).
 *
 * A visibilidade de dados já é filtrada no banco — isto aqui só evita que o
 * usuário caia numa tela que a API vai recusar de qualquer forma.
 */
export const perfilGuard: CanActivateFn = (rota) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const perfis = (rota.data?.['perfis'] as PerfilUsuario[] | undefined) ?? [];
  if (!perfis.length || auth.temPerfil(...perfis)) return true;

  return router.createUrlTree(['/painel']);
};
