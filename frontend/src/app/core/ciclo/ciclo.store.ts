import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiService } from '../http/api.service';
import { Ciclo, ResultadoPaginado } from '../models/api.models';

const CHAVE_ANO = 'discricionario.ciclo';

/**
 * O ciclo selecionado, global.
 *
 * É o coração do histórico por ano: o `cicloInterceptor` lê `ano()` e injeta
 * `?ciclo=` em toda chamada, então nenhuma tela precisa lembrar de passar o ano.
 * Trocar o ciclo na toolbar troca a safra inteira — 2027 roda sem apagar 2026.
 */
@Injectable({ providedIn: 'root' })
export class CicloStore {
  private readonly api = inject(ApiService);

  private readonly _ano = signal<number | null>(lerAno());
  private readonly _ciclos = signal<Ciclo[]>([]);
  private readonly _carregando = signal(false);

  readonly ano = this._ano.asReadonly();
  readonly ciclos = this._ciclos.asReadonly();
  readonly carregando = this._carregando.asReadonly();

  readonly cicloAtual = computed(() => {
    const ano = this._ano();
    return this._ciclos().find((ciclo) => ciclo.ano === ano) ?? null;
  });

  readonly anos = computed(() => this._ciclos().map((ciclo) => ciclo.ano));

  /** Ciclo fechado deixa as telas em modo leitura. */
  readonly somenteLeitura = computed(() => this.cicloAtual()?.status === 'FECHADO');

  /** Carrega a lista de ciclos e escolhe o ativo quando ainda não há seleção. */
  carregar(): Observable<Ciclo[]> {
    this._carregando.set(true);
    return this.api.get<ResultadoPaginado<Ciclo>>('ciclos', { limit: 500 }).pipe(
      map((resposta) => resposta.data),
      tap({
        next: (ciclos) => {
          const ordenados = [...ciclos].sort((a, b) => b.ano - a.ano);
          this._ciclos.set(ordenados);

          const atual = this._ano();
          const existe = atual !== null && ordenados.some((ciclo) => ciclo.ano === atual);
          if (!existe) {
            const ativo = ordenados.find((ciclo) => ciclo.ativo) ?? ordenados[0];
            if (ativo) this.selecionar(ativo.ano);
          }
          this._carregando.set(false);
        },
        error: () => this._carregando.set(false),
      }),
    );
  }

  selecionar(ano: number): void {
    this._ano.set(ano);
    try {
      localStorage.setItem(CHAVE_ANO, String(ano));
    } catch {
      // storage indisponível: a escolha vale só nesta aba
    }
  }

  limpar(): void {
    this._ano.set(null);
    this._ciclos.set([]);
    try {
      localStorage.removeItem(CHAVE_ANO);
    } catch {
      // idem
    }
  }
}

function lerAno(): number | null {
  try {
    const bruto = localStorage.getItem(CHAVE_ANO);
    if (!bruto) return null;
    const ano = Number(bruto);
    return Number.isFinite(ano) && ano > 2000 ? ano : null;
  } catch {
    return null;
  }
}
