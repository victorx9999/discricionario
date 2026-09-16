import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Observable } from 'rxjs';
import { AuditoriaService } from '../../core/auditoria/auditoria.service';
import { CiclosService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import { mensagemDoErro, Ciclo, PremissasCiclo } from '../../core/models/api.models';
import { FatorPipe, PercentualPipe, PontosPercentuaisPipe } from '../../shared/pipes/formatos.pipe';

export interface DadosConfirmacao {
  titulo: string;
  mensagem: string;
  confirmar: string;
}

/** Diálogo de confirmação usado pelas ações de ciclo — mora aqui porque é só disto que a tela precisa. */
@Component({
  selector: 'app-confirmacao-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ dados.titulo }}</h2>
    <mat-dialog-content>
      <p>{{ dados.mensagem }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true">
        {{ dados.confirmar }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      p {
        margin: 0;
        max-width: 46ch;
      }
    `,
  ],
})
export class ConfirmacaoDialogComponent {
  readonly dados = inject<DadosConfirmacao>(MAT_DIALOG_DATA);
}

@Component({
  selector: 'app-ciclos',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    FatorPipe,
    PercentualPipe,
    PontosPercentuaisPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ciclos.component.html',
  styleUrl: './ciclos.component.scss',
})
export class CiclosComponent implements OnInit {
  private readonly ciclosApi = inject(CiclosService);
  private readonly dialog = inject(MatDialog);
  private readonly auditoria = inject(AuditoriaService);

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly ciclos = signal<Ciclo[]>([]);
  readonly selecionado = signal<Ciclo | null>(null);

  readonly salvandoPremissas = signal(false);
  readonly erroPremissas = signal<string | null>(null);
  readonly premissasSalvas = signal(false);

  readonly criando = signal(false);
  readonly erroCriacao = signal<string | null>(null);

  readonly acaoEmCurso = signal<string | null>(null);

  readonly colunas: string[] = [
    'ano',
    'descricao',
    'status',
    'ativo',
    'percentualPool',
    'limiteFd',
    'divisorHcMax',
    'fatorPep',
    'fatorDiferimento',
    'bloquearPoolExcedido',
    'acoes',
  ];

  readonly formNovo = new FormGroup({
    ano: new FormControl<number | null>(null, { validators: [Validators.required] }),
    descricao: new FormControl<string>('', { nonNullable: true }),
    copiarPremissasDe: new FormControl<number | null>(null),
  });

  readonly formPremissas = new FormGroup({
    percentualPool: new FormControl<number | null>(null),
    limiteFd: new FormControl<number | null>(null),
    divisorHcMax: new FormControl<number | null>(null),
    fatorPep: new FormControl<number | null>(null),
    fatorDiferimento: new FormControl<number | null>(null),
    bloquearPoolExcedido: new FormControl<boolean>(false, { nonNullable: true }),
    tipoSimuladorPerformance: new FormControl<string>('', { nonNullable: true }),
    rotuloComparativo: new FormControl<string>('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.ciclosApi.listar().subscribe({
      next: (ciclos) => {
        const ordenados = [...ciclos].sort((a, b) => b.ano - a.ano);
        this.ciclos.set(ordenados);

        // Mantém a linha selecionada depois de recarregar.
        const atual = this.selecionado();
        const rematch = atual ? ordenados.find((ciclo) => ciclo.id === atual.id) : undefined;
        this.selecionar(rematch ?? ordenados[0] ?? null);

        this.carregando.set(false);
      },
      error: (erro: unknown) => {
        this.erro.set(mensagemDe(erro, 'Não consegui carregar os ciclos.'));
        this.carregando.set(false);
      },
    });
  }

  selecionar(ciclo: Ciclo | null): void {
    this.selecionado.set(ciclo);
    this.erroPremissas.set(null);
    this.premissasSalvas.set(false);

    if (!ciclo) {
      this.formPremissas.reset();
      return;
    }

    this.formPremissas.setValue({
      percentualPool: ciclo.percentualPool,
      limiteFd: ciclo.limiteFd,
      divisorHcMax: ciclo.divisorHcMax,
      fatorPep: ciclo.fatorPep,
      fatorDiferimento: ciclo.fatorDiferimento,
      bloquearPoolExcedido: ciclo.bloquearPoolExcedido,
      tipoSimuladorPerformance: ciclo.tipoSimuladorPerformance ?? '',
      rotuloComparativo: ciclo.rotuloComparativo ?? '',
    });
  }

  criarCiclo(): void {
    const ano = this.formNovo.controls.ano.value;
    if (ano === null || this.criando()) {
      this.formNovo.markAllAsTouched();
      return;
    }

    const descricao = this.formNovo.controls.descricao.value.trim();
    const copiarDe = this.formNovo.controls.copiarPremissasDe.value;

    this.criando.set(true);
    this.erroCriacao.set(null);

    this.ciclosApi
      .criar({
        ano,
        descricao: descricao === '' ? undefined : descricao,
        copiarPremissasDe: copiarDe ?? undefined,
      })
      .subscribe({
        next: (ciclo) => {
          this.criando.set(false);
          this.formNovo.reset({ ano: null, descricao: '', copiarPremissasDe: null });
          this.auditoria.registrar({
            acao: 'CICLO_CRIADO',
            entidade: 'CICLO',
            entidadeId: ciclo.id,
            detalhes: { ano: ciclo.ano },
          });
          this.carregar();
        },
        error: (erro: unknown) => {
          this.erroCriacao.set(mensagemDe(erro, 'Não consegui abrir o ciclo.'));
          this.criando.set(false);
        },
      });
  }

  ativar(ciclo: Ciclo): void {
    this.confirmar(
      {
        titulo: `Ativar o ciclo ${ciclo.ano}?`,
        mensagem:
          'O ciclo ativo é o padrão para quem entra no sistema. Os outros anos continuam consultáveis pelo seletor da barra superior.',
        confirmar: 'Ativar',
      },
      () => this.ciclosApi.ativar(ciclo.id),
      ciclo,
      'CICLO_ATIVADO',
    );
  }

  fechar(ciclo: Ciclo): void {
    this.confirmar(
      {
        titulo: `Fechar o ciclo ${ciclo.ano}?`,
        mensagem:
          'Um ciclo fechado fica somente leitura: ninguém lança discricionário nem conclui comitê nele. Os dados permanecem inteiros e podem ser consultados.',
        confirmar: 'Fechar ciclo',
      },
      () => this.ciclosApi.fechar(ciclo.id),
      ciclo,
      'CICLO_FECHADO',
    );
  }

  reabrir(ciclo: Ciclo): void {
    this.confirmar(
      {
        titulo: `Reabrir o ciclo ${ciclo.ano}?`,
        mensagem:
          'Reabrir devolve o ciclo ao estado editável. Nada é apagado — a trilha de auditoria registra a reabertura.',
        confirmar: 'Reabrir',
      },
      () => this.ciclosApi.reabrir(ciclo.id),
      ciclo,
      'CICLO_REABERTO',
    );
  }

  private confirmar(
    dados: DadosConfirmacao,
    acao: () => Observable<Ciclo>,
    ciclo: Ciclo,
    evento: string,
  ): void {
    this.dialog
      .open<ConfirmacaoDialogComponent, DadosConfirmacao, boolean>(ConfirmacaoDialogComponent, {
        data: dados,
        width: '420px',
      })
      .afterClosed()
      .subscribe((confirmado) => {
        if (confirmado !== true) return;

        this.acaoEmCurso.set(ciclo.id);
        acao().subscribe({
          next: () => {
            this.acaoEmCurso.set(null);
            this.auditoria.registrar({
              acao: evento,
              entidade: 'CICLO',
              entidadeId: ciclo.id,
              detalhes: { ano: ciclo.ano },
            });
            this.carregar();
          },
          error: (erro: unknown) => {
            this.acaoEmCurso.set(null);
            this.erro.set(mensagemDe(erro, 'Não consegui executar a ação no ciclo.'));
          },
        });
      });
  }

  salvarPremissas(): void {
    const ciclo = this.selecionado();
    if (!ciclo || this.salvandoPremissas()) return;

    const bruto = this.formPremissas.getRawValue();
    const premissas: PremissasCiclo = {
      percentualPool: bruto.percentualPool ?? undefined,
      limiteFd: bruto.limiteFd ?? undefined,
      divisorHcMax: bruto.divisorHcMax ?? undefined,
      fatorPep: bruto.fatorPep ?? undefined,
      fatorDiferimento: bruto.fatorDiferimento ?? undefined,
      bloquearPoolExcedido: bruto.bloquearPoolExcedido,
      tipoSimuladorPerformance:
        bruto.tipoSimuladorPerformance.trim() === ''
          ? undefined
          : bruto.tipoSimuladorPerformance.trim(),
      rotuloComparativo:
        bruto.rotuloComparativo.trim() === '' ? undefined : bruto.rotuloComparativo.trim(),
    };

    this.salvandoPremissas.set(true);
    this.erroPremissas.set(null);
    this.premissasSalvas.set(false);

    this.ciclosApi.salvarPremissas(ciclo.id, premissas).subscribe({
      next: () => {
        this.salvandoPremissas.set(false);
        this.premissasSalvas.set(true);
        this.auditoria.registrar({
          acao: 'PREMISSAS_ALTERADAS',
          entidade: 'CICLO',
          entidadeId: ciclo.id,
          detalhes: { ano: ciclo.ano },
        });
        this.carregar();
      },
      error: (erro: unknown) => {
        this.erroPremissas.set(mensagemDe(erro, 'Não consegui salvar as premissas.'));
        this.salvandoPremissas.set(false);
      },
    });
  }
}

function mensagemDe(erro: unknown, padrao: string): string {
  return mensagemDoErro(erroApiDe(erro)) ?? padrao;
}
