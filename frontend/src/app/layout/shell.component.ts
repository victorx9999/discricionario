import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { CicloStore } from '../core/ciclo/ciclo.store';

interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: string;
  perfis?: Array<'ADMIN' | 'ATENDIMENTO' | 'CONSULTORIA'>;
  secao?: string;
}

const MENU: ItemMenu[] = [
  { rota: '/painel', rotulo: 'Painel', icone: 'dashboard' },
  { rota: '/comites', rotulo: 'Meus comitês', icone: 'groups' },
  { rota: '/consolidacao', rotulo: 'Consolidação', icone: 'compare_arrows', perfis: ['ADMIN', 'ATENDIMENTO'] },
  { rota: '/cargas', rotulo: 'Cargas', icone: 'upload_file', perfis: ['ADMIN'], secao: 'Administração' },
  { rota: '/ciclos', rotulo: 'Ciclos', icone: 'event_repeat', perfis: ['ADMIN'] },
  { rota: '/motivadores', rotulo: 'Motivadores', icone: 'label', perfis: ['ADMIN'] },
  { rota: '/usuarios', rotulo: 'Usuários', icone: 'manage_accounts', perfis: ['ADMIN'] },
  { rota: '/auditoria', rotulo: 'Auditoria', icone: 'fact_check', perfis: ['ADMIN', 'ATENDIMENTO'] },
];

/**
 * Shell: toolbar, seletor de ciclo e menu lateral.
 *
 * O seletor de ciclo vive aqui de propósito — ele manda em toda a aplicação,
 * via `cicloInterceptor`, e é o que permite consultar 2026 depois de abrir 2027.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  readonly ciclos = inject(CicloStore);

  readonly usuario = this.auth.usuario;
  readonly menuAberto = signal(true);

  readonly itens = computed(() => MENU.filter((item) => !item.perfis || this.auth.temPerfil(...item.perfis)));

  readonly iniciais = computed(() => {
    const nome = this.usuario()?.nome ?? '';
    return nome
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() ?? '')
      .join('');
  });

  ngOnInit(): void {
    this.ciclos.carregar().subscribe({ error: () => undefined });
    // Revalida a sessão guardada no localStorage contra a API.
    this.auth.recarregarUsuario().subscribe({ error: () => undefined });
  }

  trocarCiclo(ano: number): void {
    if (ano === this.ciclos.ano()) return;
    this.ciclos.selecionar(ano);
    // Recarrega a rota atual com o novo ciclo. É o jeito mais previsível de
    // garantir que nenhuma tela fique com dados do ano anterior na tela.
    window.location.reload();
  }

  alternarMenu(): void {
    this.menuAberto.update((aberto) => !aberto);
  }

  sair(): void {
    this.ciclos.limpar();
    this.auth.sair();
  }
}
