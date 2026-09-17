import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { CicloStore } from '../../core/ciclo/ciclo.store';
import { ConsolidacaoService } from '../../core/http/catalogo.service';
import { ComitesService } from '../../core/http/comites.service';
import { erroApiDe } from '../../core/http/interceptors';
import { Comite, ComparativoComites, mensagemDoErro } from '../../core/models/api.models';
import { GraficoDiscricionariosComponent } from '../../shared/componentes/grafico-discricionarios.component';
import { GraficoPoolComitesComponent } from '../../shared/componentes/grafico-pool-comites.component';
import { MoedaPipe } from '../../shared/pipes/formatos.pipe';

/**
 * Tabela descoberta dentro de uma resposta sem contrato fixo.
 * `origem` é a chave do JSON de onde as linhas vieram — fica visível na tela
 * para que ninguém confunda o que está olhando.
 */
interface TabelaDetectada {
  origem: string;
  colunas: string[];
  linhas: Array<Record<string, unknown>>;
}

interface ParValor {
  chave: string;
  valor: string;
}

@Component({
  selector: 'app-consolidacao',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTabsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    GraficoPoolComitesComponent,
    GraficoDiscricionariosComponent,
    MoedaPipe,
    DecimalPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consolidacao.component.html',
  styleUrl: './consolidacao.component.scss',
})
export class ConsolidacaoComponent implements OnInit {
  private readonly consolidacao = inject(ConsolidacaoService);
  private readonly comites = inject(ComitesService);
  readonly ciclos = inject(CicloStore);

  readonly ctrlComites = new FormControl<string[]>([], { nonNullable: true });

  readonly carregandoComites = signal(false);
  readonly erroComites = signal<string | null>(null);
  readonly listaComites = signal<Comite[]>([]);

  readonly carregandoComparativo = signal(false);
  readonly erroComparativo = signal<string | null>(null);
  readonly dadoComparativo = signal<ComparativoComites | null>(null);

  readonly carregandoNominais = signal(false);
  readonly erroNominais = signal<string | null>(null);
  readonly dadoNominais = signal<Record<string, unknown> | null>(null);

  readonly carregandoGrupos = signal(false);
  readonly erroGrupos = signal<string | null>(null);
  readonly dadoGrupos = signal<Record<string, unknown> | null>(null);

  // Nas outras duas abas a tela procura a primeira lista de objetos que a
  // resposta trouxer — o comparativo agora tem contrato próprio e tipado.
  readonly tabelaNominais = computed(() => tabelaDe(this.dadoNominais()));
  readonly tabelaGrupos = computed(() => tabelaDe(this.dadoGrupos()));

  readonly resumoNominais = computed(() => escalaresDe(this.dadoNominais()));
  readonly resumoGrupos = computed(() => escalaresDe(this.dadoGrupos()));

  readonly jsonNominais = computed(() => paraJson(this.dadoNominais()));
  readonly jsonGrupos = computed(() => paraJson(this.dadoGrupos()));

  readonly poolPorComite = computed(
    () =>
      this.dadoComparativo()?.comites.map((comite) => ({
        comiteId: comite.comiteId,
        grupoRanking: comite.grupoRanking ?? comite.comiteId,
        poolDisponivel: comite.poolDisponivel,
        poolConsumido: comite.poolConsumido,
        percentualUtilizado: comite.percentualUtilizado,
        excedido: comite.excedido,
      })) ?? [],
  );

  ngOnInit(): void {
    this.carregarComites();
  }

  aoTrocarAba(indice: number): void {
    // Cada aba busca uma vez, na primeira abertura.
    if (indice === 1 && this.dadoNominais() === null && !this.carregandoNominais()) {
      this.carregarNominais();
    }
    if (indice === 2 && this.dadoGrupos() === null && !this.carregandoGrupos()) {
      this.carregarGrupos();
    }
  }

  carregarComites(): void {
    this.carregandoComites.set(true);
    this.erroComites.set(null);

    this.comites.listar({ limit: 200 }).subscribe({
      next: (pagina) => {
        this.listaComites.set(pagina.data);
        this.carregandoComites.set(false);
      },
      error: (erro: unknown) => {
        this.erroComites.set(mensagemDe(erro, 'Não consegui carregar a lista de comitês.'));
        this.carregandoComites.set(false);
      },
    });
  }

  compararSelecionados(): void {
    const ids = this.ctrlComites.value;
    if (ids.length === 0 || this.carregandoComparativo()) return;

    this.carregandoComparativo.set(true);
    this.erroComparativo.set(null);
    this.dadoComparativo.set(null);

    this.consolidacao.comparativo(ids).subscribe({
      next: (resposta) => {
        this.dadoComparativo.set(resposta);
        this.carregandoComparativo.set(false);
      },
      error: (erro: unknown) => {
        this.erroComparativo.set(mensagemDe(erro, 'Não consegui montar o comparativo.'));
        this.carregandoComparativo.set(false);
      },
    });
  }

  carregarNominais(): void {
    this.carregandoNominais.set(true);
    this.erroNominais.set(null);

    this.consolidacao.nominais().subscribe({
      next: (resposta) => {
        this.dadoNominais.set(resposta);
        this.carregandoNominais.set(false);
      },
      error: (erro: unknown) => {
        this.erroNominais.set(mensagemDe(erro, 'Não consegui carregar os discricionários nominais.'));
        this.carregandoNominais.set(false);
      },
    });
  }

  carregarGrupos(): void {
    this.carregandoGrupos.set(true);
    this.erroGrupos.set(null);

    this.consolidacao.controleDeGrupos().subscribe({
      next: (resposta) => {
        this.dadoGrupos.set(resposta);
        this.carregandoGrupos.set(false);
      },
      error: (erro: unknown) => {
        this.erroGrupos.set(mensagemDe(erro, 'Não consegui carregar o controle de grupos.'));
        this.carregandoGrupos.set(false);
      },
    });
  }

  celula(linha: Record<string, unknown>, coluna: string): string {
    return textoDe(linha[coluna]);
  }

  vazio(dado: Record<string, unknown> | null): boolean {
    return dado !== null && Object.keys(dado).length === 0;
  }
}

// ---------------------------------------------------------------------------
// Leitura defensiva: a API devolve Record<string, unknown> nestes três endpoints,
// então nada aqui assume nome de campo — tudo é verificado antes de ser lido.
// ---------------------------------------------------------------------------

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function registrosDe(valor: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;

  const linhas: Array<Record<string, unknown>> = [];
  for (const item of valor) {
    if (!ehRegistro(item)) return null;
    linhas.push(item);
  }
  return linhas;
}

function tabelaDe(dado: Record<string, unknown> | null, preferida?: string): TabelaDetectada | null {
  if (dado === null) return null;

  const chaves = Object.keys(dado);
  const ordem =
    preferida !== undefined && chaves.includes(preferida)
      ? [preferida, ...chaves.filter((chave) => chave !== preferida)]
      : chaves;

  for (const chave of ordem) {
    const linhas = registrosDe(dado[chave]);
    if (linhas !== null) {
      return { origem: chave, colunas: colunasDe(linhas), linhas };
    }
  }
  return null;
}

function colunasDe(linhas: Array<Record<string, unknown>>): string[] {
  const colunas: string[] = [];
  for (const linha of linhas) {
    for (const chave of Object.keys(linha)) {
      if (!colunas.includes(chave)) colunas.push(chave);
    }
  }
  return colunas;
}

/** Campos simples do topo da resposta — viram os KPIs do cabeçalho da aba. */
function escalaresDe(dado: Record<string, unknown> | null): ParValor[] {
  if (dado === null) return [];

  const pares: ParValor[] = [];
  for (const [chave, valor] of Object.entries(dado)) {
    if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') {
      pares.push({ chave, valor: textoDe(valor) });
    }
  }
  return pares;
}

function paraJson(dado: Record<string, unknown> | null): string {
  if (dado === null) return '';
  try {
    return JSON.stringify(dado, null, 2);
  } catch {
    return 'Não consegui formatar a resposta como JSON.';
  }
}

function textoDe(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor);
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

function mensagemDe(erro: unknown, padrao: string): string {
  return mensagemDoErro(erroApiDe(erro)) ?? padrao;
}
