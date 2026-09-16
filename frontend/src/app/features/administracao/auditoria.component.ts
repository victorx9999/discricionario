import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuditoriaService } from '../../core/auditoria/auditoria.service';
import { erroApiDe } from '../../core/http/interceptors';
import { mensagemDoErro, LogAuditoria } from '../../core/models/api.models';
import { DataBrPipe } from '../../shared/pipes/formatos.pipe';

@Component({
  selector: 'app-auditoria',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    DataBrPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auditoria.component.html',
  styleUrl: './auditoria.component.scss',
})
export class AuditoriaComponent implements OnInit {
  private readonly auditoria = inject(AuditoriaService);

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly registros = signal<LogAuditoria[]>([]);

  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly limite = signal(50);

  readonly opcoesDePagina: number[] = [25, 50, 100, 200];

  readonly colunas: string[] = [
    'dataHora',
    'usuario',
    'acao',
    'entidade',
    'campo',
    'valores',
    'origem',
    'ip',
  ];

  readonly filtros = new FormGroup({
    acao: new FormControl<string>('', { nonNullable: true }),
    usuario: new FormControl<string>('', { nonNullable: true }),
    de: new FormControl<string>('', { nonNullable: true }),
    ate: new FormControl<string>('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.consultar();
  }

  aplicarFiltros(): void {
    this.pagina.set(1);
    this.consultar();
  }

  limparFiltros(): void {
    this.filtros.reset({ acao: '', usuario: '', de: '', ate: '' });
    this.pagina.set(1);
    this.consultar();
  }

  aoPaginar(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex + 1);
    this.limite.set(evento.pageSize);
    this.consultar();
  }

  consultar(): void {
    const bruto = this.filtros.getRawValue();

    this.carregando.set(true);
    this.erro.set(null);

    this.auditoria
      .consultar({
        page: this.pagina(),
        limit: this.limite(),
        acao: opcional(bruto.acao),
        usuario: opcional(bruto.usuario),
        de: opcional(bruto.de),
        ate: opcional(bruto.ate),
      })
      .subscribe({
        next: (resultado) => {
          this.registros.set(resultado.data);
          this.total.set(resultado.total);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(mensagemDe(erro, 'Não consegui consultar a trilha de auditoria.'));
          this.carregando.set(false);
        },
      });
  }

  /** Os valores anterior/novo chegam como `unknown` — objeto vira JSON legível. */
  valor(valor: unknown): string {
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

  usuarioDe(registro: LogAuditoria): string {
    return registro.usuarioNome ?? registro.usuarioEmail ?? 'Sistema';
  }
}

function opcional(texto: string): string | undefined {
  const limpo = texto.trim();
  return limpo === '' ? undefined : limpo;
}

function mensagemDe(erro: unknown, padrao: string): string {
  return mensagemDoErro(erroApiDe(erro)) ?? padrao;
}
