import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MotivosService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import { mensagemDoErro, Motivo } from '../../core/models/api.models';
import { PontosPercentuaisPipe } from '../../shared/pipes/formatos.pipe';

@Component({
  selector: 'app-motivadores',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    PontosPercentuaisPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './motivadores.component.html',
  styleUrl: './motivadores.component.scss',
})
export class MotivadoresComponent implements OnInit {
  private readonly motivos = inject(MotivosService);

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly lista = signal<Motivo[]>([]);

  readonly salvando = signal(false);
  readonly erroFormulario = signal<string | null>(null);
  readonly editando = signal<Motivo | null>(null);

  readonly acaoEmCurso = signal<string | null>(null);

  readonly mostrarRemovidos = signal(false);

  readonly colunas: string[] = [
    'codigo',
    'descricao',
    'limiteFd',
    'exigeJustificativa',
    'ativo',
    'acoes',
  ];

  readonly form = new FormGroup({
    codigo: new FormControl<number | null>(null, { validators: [Validators.required] }),
    descricao: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    limiteFd: new FormControl<number | null>(null),
    exigeJustificativa: new FormControl<boolean>(true, { nonNullable: true }),
    ativo: new FormControl<boolean>(true, { nonNullable: true }),
    ordem: new FormControl<number | null>(null),
  });

  readonly tituloFormulario = computed(() => {
    const motivo = this.editando();
    return motivo ? `Editar motivador ${motivo.codigo}` : 'Novo motivador';
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.motivos
      .listar({
        limit: 200,
        page: 1,
        withDeleted: this.mostrarRemovidos() ? true : undefined,
      })
      .subscribe({
        next: (pagina) => {
          this.lista.set(pagina.data);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(mensagemDe(erro, 'Não consegui carregar os motivadores.'));
          this.carregando.set(false);
        },
      });
  }

  alternarRemovidos(evento: MatCheckboxChange): void {
    this.mostrarRemovidos.set(evento.checked);
    this.carregar();
  }

  editar(motivo: Motivo): void {
    this.editando.set(motivo);
    this.erroFormulario.set(null);
    this.form.setValue({
      codigo: motivo.codigo,
      descricao: motivo.descricao,
      limiteFd: motivo.limiteFd,
      exigeJustificativa: motivo.exigeJustificativa,
      ativo: motivo.ativo,
      ordem: motivo.ordem ?? null,
    });
  }

  novo(): void {
    this.editando.set(null);
    this.erroFormulario.set(null);
    this.form.reset({
      codigo: null,
      descricao: '',
      limiteFd: null,
      exigeJustificativa: true,
      ativo: true,
      ordem: null,
    });
  }

  salvar(): void {
    if (this.form.invalid || this.salvando()) {
      this.form.markAllAsTouched();
      return;
    }

    const bruto = this.form.getRawValue();
    const corpo: Partial<Motivo> = {
      codigo: bruto.codigo ?? undefined,
      descricao: bruto.descricao.trim(),
      limiteFd: bruto.limiteFd,
      exigeJustificativa: bruto.exigeJustificativa,
      ativo: bruto.ativo,
      ordem: bruto.ordem ?? undefined,
    };

    const emEdicao = this.editando();
    const requisicao = emEdicao
      ? this.motivos.atualizar(emEdicao.id, corpo)
      : this.motivos.criar(corpo);

    this.salvando.set(true);
    this.erroFormulario.set(null);

    requisicao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.novo();
        this.carregar();
      },
      error: (erro: unknown) => {
        this.erroFormulario.set(mensagemDe(erro, 'Não consegui salvar o motivador.'));
        this.salvando.set(false);
      },
    });
  }

  remover(motivo: Motivo): void {
    if (this.acaoEmCurso() !== null) return;

    this.acaoEmCurso.set(motivo.id);
    this.motivos.remover(motivo.id).subscribe({
      next: () => {
        this.acaoEmCurso.set(null);
        if (this.editando()?.id === motivo.id) this.novo();
        this.carregar();
      },
      error: (erro: unknown) => {
        this.acaoEmCurso.set(null);
        this.erro.set(mensagemDe(erro, 'Não consegui remover o motivador.'));
      },
    });
  }

  restaurar(motivo: Motivo): void {
    if (this.acaoEmCurso() !== null) return;

    this.acaoEmCurso.set(motivo.id);
    this.motivos.restaurar(motivo.id).subscribe({
      next: () => {
        this.acaoEmCurso.set(null);
        this.carregar();
      },
      error: (erro: unknown) => {
        this.acaoEmCurso.set(null);
        this.erro.set(mensagemDe(erro, 'Não consegui restaurar o motivador.'));
      },
    });
  }
}

function mensagemDe(erro: unknown, padrao: string): string {
  return mensagemDoErro(erroApiDe(erro)) ?? padrao;
}
