import { Routes } from '@angular/router';
import { authGuard, perfilGuard } from './core/auth/guards';

/**
 * Rotas do app.
 *
 * Tudo abaixo do shell exige sessão. As telas de administração ainda passam
 * pelo `perfilGuard` — mas a visibilidade dos dados é garantida no banco, não aqui.
 */
export const rotas: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/autenticacao/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },

      {
        path: 'painel',
        title: 'Painel do ciclo',
        loadComponent: () =>
          import('./features/painel/painel.component').then((m) => m.PainelComponent),
      },

      {
        path: 'comites',
        title: 'Comitês',
        loadComponent: () =>
          import('./features/comites/lista/lista-comites.component').then(
            (m) => m.ListaComitesComponent,
          ),
      },
      {
        path: 'comites/novo',
        title: 'Montar comitê',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN', 'ATENDIMENTO'] },
        loadComponent: () =>
          import('./features/comites/montagem/montagem-comite.component').then(
            (m) => m.MontagemComiteComponent,
          ),
      },
      {
        path: 'comites/:id/editar',
        title: 'Editar comitê',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN', 'ATENDIMENTO'] },
        loadComponent: () =>
          import('./features/comites/montagem/montagem-comite.component').then(
            (m) => m.MontagemComiteComponent,
          ),
      },
      {
        path: 'comites/:id',
        title: 'Comitê',
        loadComponent: () =>
          import('./features/comites/comite-pagina/comite-pagina.component').then(
            (m) => m.ComitePaginaComponent,
          ),
      },

      {
        path: 'consolidacao',
        title: 'Consolidação',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN', 'ATENDIMENTO'] },
        loadComponent: () =>
          import('./features/consolidacao/consolidacao.component').then(
            (m) => m.ConsolidacaoComponent,
          ),
      },
      {
        path: 'cargas',
        title: 'Cargas',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN'] },
        loadComponent: () =>
          import('./features/cargas/cargas.component').then((m) => m.CargasComponent),
      },
      {
        path: 'ciclos',
        title: 'Ciclos',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN'] },
        loadComponent: () =>
          import('./features/administracao/ciclos.component').then((m) => m.CiclosComponent),
      },
      {
        path: 'motivadores',
        title: 'Motivadores',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN'] },
        loadComponent: () =>
          import('./features/administracao/motivadores.component').then(
            (m) => m.MotivadoresComponent,
          ),
      },
      {
        path: 'usuarios',
        title: 'Usuários',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN'] },
        loadComponent: () =>
          import('./features/administracao/usuarios.component').then((m) => m.UsuariosComponent),
      },
      {
        path: 'auditoria',
        title: 'Auditoria',
        canActivate: [perfilGuard],
        data: { perfis: ['ADMIN', 'ATENDIMENTO'] },
        loadComponent: () =>
          import('./features/administracao/auditoria.component').then((m) => m.AuditoriaComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
