import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CicloStore } from '../../core/ciclo/ciclo.store';
import { ConsolidacaoService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import { mensagemDoErro, StatusComite, VisaoGeral } from '../../core/models/api.models';
import { MoedaPipe, PercentualPipe } from '../../shared/pipes/formatos.pipe';

type LinhaComite = VisaoGeral['porComite'][number];

/** Acima disto o consumo do pool já merece destaque visual. */
const LIMITE_ATENCAO = 85;

/**
 * Painel do ciclo: o retrato de como os comitês estão andando.
 *
 * Tudo vem pronto de `consolidacao/visao-geral` — a tela não soma nada, só
 * arruma. O ano não é passado na chamada: o `cicloInterceptor` cuida disso.
 */
@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MoedaPipe,
    PercentualPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel.component.html',
  styleUrl: './painel.component.scss',
})
export class PainelComponent implements OnInit {
  private readonly consolidacao = inject(ConsolidacaoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ciclos = inject(CicloStore);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly visao = signal<VisaoGeral | null>(null);

  readonly colunas: string[] = [
    'comite',
    'status',
    'participantes',
    'analisados',
    'pendencias',
    'poolDisponivel',
    'poolConsumido',
    'saldo',
    'percentualUtilizado',
    'acao',
  ];

  readonly ano = computed(() => this.visao()?.ciclo ?? this.ciclos.ano());
  readonly kpis = computed(() => this.visao()?.kpis ?? null);
  readonly alertas = computed(() => this.visao()?.alertas ?? []);
  readonly linhas = computed<LinhaComite[]>(() => this.visao()?.porComite ?? []);

  readonly percentualPool = computed(() => this.kpis()?.percentualUtilizado ?? 0);
  /** A barra para de crescer em 100%; o excedente aparece pela cor e pelo número. */
  readonly larguraPool = computed(() => Math.max(0, Math.min(100, this.percentualPool())));
  readonly poolAlto = computed(() => this.percentualPool() > LIMITE_ATENCAO);
  readonly poolExcedido = computed(() => this.percentualPool() > 100);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.consolidacao
      .visaoGeral()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (visao) => {
          this.visao.set(visao);
          this.carregando.set(false);
        },
        error: (falha: unknown) => {
          this.erro.set(
            mensagemDoErro(erroApiDe(falha)) ?? 'Não consegui carregar o painel deste ciclo.',
          );
          this.carregando.set(false);
        },
      });
  }

  abrir(comiteId: string): void {
    void this.router.navigate(['/comites', comiteId]);
  }

  rotuloStatus(status: StatusComite): string {
    return status === 'CONCLUIDO' ? 'concluído' : 'em andamento';
  }

  classeStatus(status: StatusComite): string {
    return status === 'CONCLUIDO' ? 'chip-ok' : 'chip-atencao';
  }

  classePercentual(percentual: number): string {
    if (percentual > 100) return 'excedido';
    if (percentual > LIMITE_ATENCAO) return 'alto';
    return '';
  }
}
