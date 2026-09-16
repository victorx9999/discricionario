import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuditoriaService } from '../../../core/auditoria/auditoria.service';
import { AuthService } from '../../../core/auth/auth.service';
import { CicloStore } from '../../../core/ciclo/ciclo.store';
import { ComitesService } from '../../../core/http/comites.service';
import { erroApiDe } from '../../../core/http/interceptors';
import { ParticipantesService } from '../../../core/http/participantes.service';
import {
  Comite,
  GraficosParticipante,
  LayoutComite,
  mensagemDoErro,
  ParticipanteLinha,
  ResultadoPool,
  ResumoComite,
} from '../../../core/models/api.models';
import { BlocoGraficosComponent } from '../../../shared/componentes/bloco-graficos.component';
import { MedidorPoolComponent } from '../../../shared/componentes/medidor-pool.component';
import { PainelDiscricionarioComponent } from '../../../shared/componentes/painel-discricionario.component';
import { PersonalizarComiteComponent } from '../../../shared/componentes/personalizar-comite.component';
import { TabelaParticipantesComponent } from '../../../shared/componentes/tabela-participantes.component';
import { FatorPipe, MoedaPipe, PontosPercentuaisPipe, VariacaoPipe } from '../../../shared/pipes/formatos.pipe';
import { AbaAtaComponent } from './partes/aba-ata.component';
import { ResumoNivelComponent } from './partes/resumo-nivel.component';

/**
 * A tela do comitê.
 *
 * Uma tela só, na ordem em que a reunião trabalha:
 *   1. resumo por nível de cargo em cima;
 *   2. no meio, o fator discricionário de um lado e, do outro, a performance
 *      ponderada e o bloco de gráficos, um embaixo do outro;
 *   3. a tabela embaixo, que é por onde se navega entre as pessoas.
 *
 * Pool e ATA são abas — são conferência, não decisão, e tirá-las do caminho
 * deixa a tela de trabalho respirar.
 */
@Component({
  selector: 'app-comite-pagina',
  standalone: true,
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    ResumoNivelComponent,
    PainelDiscricionarioComponent,
    BlocoGraficosComponent,
    TabelaParticipantesComponent,
    PersonalizarComiteComponent,
    MedidorPoolComponent,
    AbaAtaComponent,
    MoedaPipe,
    FatorPipe,
    VariacaoPipe,
    PontosPercentuaisPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comite-pagina.component.html',
  styleUrl: './comite-pagina.component.scss',
})
export class ComitePaginaComponent implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly comites = inject(ComitesService);
  private readonly participantesApi = inject(ParticipantesService);
  private readonly auditoria = inject(AuditoriaService);
  private readonly auth = inject(AuthService);
  readonly ciclos = inject(CicloStore);

  readonly comiteId = signal<string>('');
  readonly comite = signal<Comite | null>(null);
  readonly resumo = signal<ResumoComite | null>(null);
  readonly pool = signal<ResultadoPool | null>(null);
  readonly layout = signal<LayoutComite | null>(null);
  readonly participantes = signal<ParticipanteLinha[]>([]);
  readonly graficos = signal<GraficosParticipante | null>(null);

  readonly selecionado = signal<ParticipanteLinha | null>(null);
  readonly personalizando = signal(false);

  readonly carregando = signal(true);
  readonly carregandoLinhas = signal(false);
  readonly erro = signal<string | null>(null);

  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly tamanho = signal(25);

  readonly podeMontar = this.auth.podeMontar;

  /** Comitê concluído ou ciclo fechado travam qualquer lançamento. */
  readonly somenteLeitura = computed(
    () => this.ciclos.somenteLeitura() || this.comite()?.status === 'CONCLUIDO',
  );

  readonly camposPainel = computed(() => {
    const atual = this.layout();
    if (!atual) return [];
    return atual.painel.colunas.filter((campo) => campo.visivel).sort((a, b) => a.ordem - b.ordem);
  });

  readonly colunasTabela = computed(() => this.layout()?.tabela.colunas ?? []);

  readonly performance = computed(() => this.resumo()?.performancePonderada ?? null);

  /** Quem já teve discricionário lançado, para a aba Pool. */
  readonly consumidores = computed(() =>
    this.participantes()
      .filter((linha) => linha.fd !== 0)
      .sort((a, b) => b.diferencaDiscricionario - a.diferencaDiscricionario),
  );

  readonly indiceSelecionado = computed(() => {
    const atual = this.selecionado();
    if (!atual) return -1;
    return this.participantes().findIndex((linha) => linha.id === atual.id);
  });

  readonly temAnterior = computed(() => this.indiceSelecionado() > 0);
  readonly temProximo = computed(
    () => this.indiceSelecionado() >= 0 && this.indiceSelecionado() < this.participantes().length - 1,
  );

  ngOnInit(): void {
    const id = this.rota.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/comites']);
      return;
    }
    this.comiteId.set(id);
    this.carregar();
  }

  private carregar(): void {
    const id = this.comiteId();
    this.carregando.set(true);
    this.erro.set(null);

    forkJoin({
      comite: this.comites.buscar(id),
      resumo: this.comites.resumo(id),
      pool: this.comites.pool(id),
      layout: this.comites.layout(id),
    }).subscribe({
      next: ({ comite, resumo, pool, layout }) => {
        this.comite.set(comite);
        this.resumo.set(resumo);
        this.pool.set(pool);
        this.layout.set(layout);
        this.carregando.set(false);
        this.auditoria.comiteAberto(comite.id, comite.nome);
        this.carregarParticipantes(true);
      },
      error: (falha: unknown) => {
        this.carregando.set(false);
        this.erro.set(
          mensagemDoErro(erroApiDe(falha)) ??
            'Não consegui abrir este comitê. Ele pode não existir neste ciclo ou estar fora do seu acesso.',
        );
      },
    });
  }

  private carregarParticipantes(selecionarPrimeiro = false): void {
    this.carregandoLinhas.set(true);
    this.comites
      .participantes(this.comiteId(), { page: this.pagina() + 1, limit: this.tamanho() })
      .subscribe({
        next: (resposta) => {
          this.participantes.set(resposta.data);
          this.total.set(resposta.total);
          this.carregandoLinhas.set(false);

          if (selecionarPrimeiro && resposta.data.length) {
            this.selecionarParticipante(resposta.data[0]);
            return;
          }

          // Mantém a seleção viva depois de uma recarga da página atual.
          const atual = this.selecionado();
          if (atual) {
            const atualizado = resposta.data.find((linha) => linha.id === atual.id);
            if (atualizado) this.selecionado.set(atualizado);
          }
        },
        error: () => this.carregandoLinhas.set(false),
      });
  }

  selecionarParticipante(linha: ParticipanteLinha): void {
    this.selecionado.set(linha);
    this.graficos.set(null);
    this.auditoria.participanteVisualizado(this.comiteId(), linha.id, linha.nome);

    this.participantesApi.graficos(linha.id).subscribe({
      next: (dados) => this.graficos.set(dados),
      error: () => this.graficos.set(null),
    });
  }

  anterior(): void {
    const indice = this.indiceSelecionado();
    if (indice > 0) this.selecionarParticipante(this.participantes()[indice - 1]);
  }

  proximo(): void {
    const indice = this.indiceSelecionado();
    if (indice >= 0 && indice < this.participantes().length - 1) {
      this.selecionarParticipante(this.participantes()[indice + 1]);
    }
  }

  trocarPagina(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
    this.tamanho.set(evento.pageSize);
    this.carregarParticipantes(true);
  }

  /**
   * Depois de gravar um FD, resumo e pool mudam junto — HC com discricionário,
   * checagem OK/REVER e saldo precisam refletir a decisão na hora.
   */
  aoLancar(atualizado: ParticipanteLinha): void {
    this.participantes.update((linhas) =>
      linhas.map((linha) => (linha.id === atualizado.id ? atualizado : linha)),
    );
    this.selecionado.set(atualizado);

    forkJoin({
      resumo: this.comites.resumo(this.comiteId()),
      pool: this.comites.pool(this.comiteId()),
    }).subscribe({
      next: ({ resumo, pool }) => {
        this.resumo.set(resumo);
        this.pool.set(pool);
      },
      error: () => undefined,
    });

    this.participantesApi.graficos(atualizado.id).subscribe({
      next: (dados) => this.graficos.set(dados),
      error: () => undefined,
    });
  }

  aoSalvarLayout(layout: LayoutComite): void {
    this.layout.set(layout);
    this.personalizando.set(false);
  }

  aoMudarComite(): void {
    this.comites.buscar(this.comiteId()).subscribe({
      next: (comite) => this.comite.set(comite),
      error: () => undefined,
    });
  }

  editarComite(): void {
    void this.router.navigate(['/comites', this.comiteId(), 'editar']);
  }
}
