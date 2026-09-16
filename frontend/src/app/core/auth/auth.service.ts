import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import { PerfilUsuario, RespostaLogin, Usuario } from '../models/api.models';

const CHAVE_TOKEN = 'discricionario.token';
const CHAVE_USUARIO = 'discricionario.usuario';

/**
 * Sessão do usuário.
 *
 * O token vai para `localStorage` porque a API é stateless e o app precisa
 * sobreviver a um F5. Toda leitura é defensiva: em aba anônima ou com storage
 * bloqueado o acesso pode lançar, e nesse caso a sessão simplesmente não persiste.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(ler(CHAVE_TOKEN));
  private readonly _usuario = signal<Usuario | null>(lerJson<Usuario>(CHAVE_USUARIO));

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => Boolean(this._token()));
  readonly perfil = computed<PerfilUsuario | null>(() => this._usuario()?.perfil ?? null);

  readonly ehAdmin = computed(() => this.perfil() === 'ADMIN');
  readonly ehAtendimento = computed(() => this.perfil() === 'ATENDIMENTO');
  readonly ehConsultoria = computed(() => this.perfil() === 'CONSULTORIA');
  /** Quem pode montar comitês, editar layout e carregar bases. */
  readonly podeMontar = computed(() => this.ehAdmin() || this.ehAtendimento());

  token(): string | null {
    return this._token();
  }

  entrar(email: string, senha: string): Observable<RespostaLogin> {
    return this.api.post<RespostaLogin>('auth/login', { email, senha }).pipe(
      tap((resposta) => {
        this._token.set(resposta.accessToken);
        this._usuario.set(resposta.usuario);
        gravar(CHAVE_TOKEN, resposta.accessToken);
        gravar(CHAVE_USUARIO, JSON.stringify(resposta.usuario));
      }),
    );
  }

  /** Revalida a sessão guardada — usado no bootstrap, depois de um F5. */
  recarregarUsuario(): Observable<Usuario> {
    return this.api
      .get<Usuario>('auth/me')
      .pipe(tap((usuario) => {
        this._usuario.set(usuario);
        gravar(CHAVE_USUARIO, JSON.stringify(usuario));
      }));
  }

  sair(navegar = true): void {
    // O logout do servidor é registro de auditoria; a sessão local cai de todo jeito.
    if (this._token()) {
      this.api.post('auth/logout').subscribe({ error: () => undefined });
    }
    this.limpar();
    if (navegar) void this.router.navigate(['/login']);
  }

  limpar(): void {
    this._token.set(null);
    this._usuario.set(null);
    apagar(CHAVE_TOKEN);
    apagar(CHAVE_USUARIO);
  }

  temPerfil(...perfis: PerfilUsuario[]): boolean {
    const atual = this.perfil();
    return atual !== null && perfis.includes(atual);
  }
}

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function lerJson<T>(chave: string): T | null {
  const bruto = ler(chave);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as T;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // storage indisponível: a sessão vale só enquanto a aba estiver aberta
  }
}

function apagar(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    // idem
  }
}
