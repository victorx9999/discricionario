import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorIntl, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { Params, filtro } from '../../../core/http/api.service';
import { ComitesService } from '../../../core/http/comites.service';
import { erroApiDe } from '../../../core/http/interceptors';
import { mensagemDoErro, Comite, ResultadoPaginado, StatusComite, TipoComite } from '../../../core/models/api.models';

interface OpcaoStatus {
  valor: StatusComite | '';
  rotulo: string;
}

const ROTULOS_TIPO: Record<TipoComite, string> = {
  INSTITUCIONAL: 'Institucional',
  COMUNIDADE: 'Comunidade',
  MISTO: 'Misto',
};

const PAGINA_VAZIA: ResultadoPaginado<Comite> = {
  data: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 0,
};

/** Textos do paginador: o Material só traz o inglês de fábrica. */
function paginadorPtBr(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Comitês por página';
  intl.nextPageLabel = 'Próxima página';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primeira página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (pagina: number, tamanho: number, total: number): string => {
    if (total === 0) return '0 de 0';
    const inicio = pagina * tamanho + 1;
    const fim = Math.min(inicio + tamanho - 1, total);
    return `${inicio}–${fim} de ${total}`;
  };
  return intl;
}

/**
 * Lista de comitês do ciclo.
 *
 * A consultoria só enxerga os comitês em que responde — o recorte é feito no
 * banco, então aqui a lista é sempre "o que eu posso ver", sem filtro extra.
 */
@Component({
  selector: 'app-lista-comites',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [{ provide: MatPaginatorIntl, useFactory: paginadorPtBr }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lista-comites.component.html',
  styleUrl: './lista-comites.component.scss',
})
export class ListaComitesComponent implements OnInit {
  private readonly comites = inject(ComitesService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly podeMontar = this.auth.podeMontar;

  readonly busca = new FormControl('', { nonNullable: true });
  readonly status = new FormControl<StatusComite | ''>('', { nonNullable: true });

  readonly opcoesStatus: OpcaoStatus[] = [
    { valor: '', rotulo: 'Todos os status' },
    { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
    { valor: 'CONCLUIDO', rotulo: 'Concluídos' },
  ];

  readonly tamanhosPagina: number[] = [10, 25, 50];

  readonly linhas = signal<Comite[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly tamanho = signal(25);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly colunas: string[] = [
    'codigo',
    'nome',
    'area',
    'tipo',
    'status',
    'participantes',
    'ata',
  ];

  private readonly pedidos = new Subject<void>();

  constructor() {
    // switchMap e não mergeMap: com a busca em debounce ainda dá para ter duas
    // respostas em voo, e só a última pode pintar a tabela.
    this.pedidos
      .pipe(
        switchMap(() => {
          this.carregando.set(true);
          this.erro.set(null);
          return this.comites.listar(this.parametros()).pipe(
            catchError((falha: unknown) => {
              this.erro.set(
                mensagemDoErro(erroApiDe(falha)) ?? 'Não consegui carregar os comitês deste ciclo.',
              );
              return of(PAGINA_VAZIA);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((resultado) => {
        this.linhas.set(resultado.data);
        this.total.set(resultado.total);
        this.carregando.set(false);
      });

    this.busca.valueChanges
      .pipe(
        debounceTime(350),
        map((texto) => texto.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // Trocar o termo com a página 3 aberta traria um resultado vazio.
        this.pagina.set(0);
        this.pedidos.next();
      });

    this.status.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.pagina.set(0);
      this.pedidos.next();
    });
  }

  ngOnInit(): void {
    this.pedidos.next();
  }

  trocarPagina(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex);
    this.tamanho.set(evento.pageSize);
    this.pedidos.next();
  }

  recarregar(): void {
    this.pedidos.next();
  }

  limparBusca(): void {
    this.busca.setValue('');
  }

  abrir(comite: Comite): void {
    void this.router.navigate(['/comites', comite.id]);
  }

  montar(): void {
    void this.router.navigate(['/comites/novo']);
  }

  rotuloTipo(tipo: TipoComite): string {
    return ROTULOS_TIPO[tipo];
  }

  rotuloStatus(status: StatusComite): string {
    return status === 'CONCLUIDO' ? 'concluído' : 'em andamento';
  }

  classeStatus(status: StatusComite): string {
    return status === 'CONCLUIDO' ? 'chip-ok' : 'chip-atencao';
  }

  /** Verdadeiro quando o vazio veio de um filtro, não de um ciclo sem comitês. */
  filtrando(): boolean {
    return this.busca.value.trim().length > 0 || this.status.value !== '';
  }

  private parametros(): Params {
    const params: Params = {
      page: this.pagina() + 1,
      limit: this.tamanho(),
    };

    const termo = this.busca.value.trim();
    if (termo) params['search'] = termo;

    const status = this.status.value;
    if (status) params['filter'] = filtro('status', 'eq', status);

    return params;
  }
}
