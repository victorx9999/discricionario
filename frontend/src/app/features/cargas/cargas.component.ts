import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { AuditoriaService } from '../../core/auditoria/auditoria.service';
import { CicloStore } from '../../core/ciclo/ciclo.store';
import { UploadsService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import {
  ErroLinha,
  Importacao,
  LayoutBase,
  ModoCarga,
  PreviaUpload,
  StatusImportacao,
  TipoBase,
  mensagemDoErro,
} from '../../core/models/api.models';
import { DataBrPipe } from '../../shared/pipes/formatos.pipe';

/** Linhas de erro da importação vêm sem contrato fixo — a tela descobre as colunas. */
interface ErrosDaImportacao {
  importacaoId: string;
  colunas: string[];
  linhas: Array<Record<string, unknown>>;
}

@Component({
  selector: 'app-cargas',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatStepperModule,
    MatButtonModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    DataBrPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cargas.component.html',
  styleUrl: './cargas.component.scss',
})
export class CargasComponent implements OnInit {
  private readonly uploads = inject(UploadsService);
  private readonly auditoria = inject(AuditoriaService);
  readonly ciclos = inject(CicloStore);

  // Formulário do passo 1 — controles tipados para não precisar de `any` no template.
  readonly ctrlTipoBase = new FormControl<TipoBase>('PRINCIPAL', { nonNullable: true });
  readonly ctrlModo = new FormControl<ModoCarga>('COMPLETA', { nonNullable: true });
  readonly ctrlConfirmaReinicio = new FormControl<boolean>(false, { nonNullable: true });
  readonly ctrlVincularGrupo = new FormControl<boolean>(true, { nonNullable: true });

  private readonly tipoBaseSelecionado = toSignal(this.ctrlTipoBase.valueChanges, {
    initialValue: this.ctrlTipoBase.value,
  });
  private readonly modoSelecionado = toSignal(this.ctrlModo.valueChanges, {
    initialValue: this.ctrlModo.value,
  });
  readonly confirmouReinicio = toSignal(this.ctrlConfirmaReinicio.valueChanges, {
    initialValue: this.ctrlConfirmaReinicio.value,
  });

  readonly tipoBase = computed<TipoBase>(() => this.tipoBaseSelecionado());

  /** ACRÉSCIMO não tem carga parcial: o arquivo substitui a base inteira do ciclo. */
  readonly modo = computed<ModoCarga>(() =>
    this.tipoBase() === 'ACRESCIMO' ? 'COMPLETA' : this.modoSelecionado(),
  );

  readonly arquivo = signal<File | null>(null);

  readonly carregandoPrevia = signal(false);
  readonly erroPrevia = signal<string | null>(null);
  readonly previa = signal<PreviaUpload | null>(null);

  readonly processando = signal(false);
  readonly erroProcesso = signal<string | null>(null);
  readonly resultado = signal<Importacao | null>(null);

  readonly carregandoHistorico = signal(false);
  readonly erroHistorico = signal<string | null>(null);
  readonly historico = signal<Importacao[]>([]);

  readonly carregandoLayouts = signal(false);
  readonly erroLayouts = signal<string | null>(null);
  readonly layouts = signal<LayoutBase[]>([]);

  readonly carregandoErros = signal(false);
  readonly erroErros = signal<string | null>(null);
  readonly errosImportacao = signal<ErrosDaImportacao | null>(null);
  readonly importacaoSelecionada = signal<string | null>(null);

  readonly colunasHistorico: string[] = [
    'data',
    'arquivo',
    'tipo',
    'modo',
    'status',
    'inseridos',
    'atualizados',
    'removidos',
    'erros',
  ];
  readonly colunasErrosPrevia: string[] = ['linha', 'coluna', 'valor', 'mensagem'];

  readonly faltamColunas = computed(
    () => (this.previa()?.colunasObrigatoriasAusentes.length ?? 0) > 0,
  );

  /** Só libera o passo 2 quando a prévia rodou sem coluna obrigatória faltando. */
  readonly previaAprovada = computed(
    () => this.previa() !== null && !this.faltamColunas() && this.arquivo() !== null,
  );

  readonly exigeConfirmacao = computed(() => this.modo() === 'COMPLETA');

  readonly podeProcessar = computed(
    () =>
      this.previaAprovada() &&
      !this.processando() &&
      (!this.exigeConfirmacao() || this.confirmouReinicio()),
  );

  readonly amostraColunas = computed(() => chavesDe(this.previa()?.amostra ?? []));

  ngOnInit(): void {
    this.carregarHistorico();
    this.carregarLayouts();
  }

  aoEscolherArquivo(evento: Event): void {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLInputElement)) return;

    this.arquivo.set(alvo.files && alvo.files.length > 0 ? alvo.files[0] : null);
    this.previa.set(null);
    this.erroPrevia.set(null);
    this.resultado.set(null);
    this.erroProcesso.set(null);
    this.ctrlConfirmaReinicio.setValue(false);
  }

  analisar(): void {
    const arquivo = this.arquivo();
    if (!arquivo || this.carregandoPrevia()) return;

    this.carregandoPrevia.set(true);
    this.erroPrevia.set(null);
    this.previa.set(null);

    this.uploads.previa(arquivo, this.tipoBase(), this.modo()).subscribe({
      next: (previa) => {
        this.previa.set(previa);
        this.carregandoPrevia.set(false);
      },
      error: (erro: unknown) => {
        this.erroPrevia.set(mensagemDe(erro, 'Não consegui analisar o arquivo.'));
        this.carregandoPrevia.set(false);
      },
    });
  }

  processar(): void {
    const arquivo = this.arquivo();
    if (!arquivo || !this.podeProcessar()) return;

    this.processando.set(true);
    this.erroProcesso.set(null);
    this.resultado.set(null);

    this.uploads
      .processar(arquivo, this.tipoBase(), this.modo(), {
        confirmarReinicioDoCiclo: this.exigeConfirmacao() ? this.confirmouReinicio() : undefined,
        vincularPorGrupoRanking: this.ctrlVincularGrupo.value,
      })
      .subscribe({
        next: (importacao) => {
          this.resultado.set(importacao);
          this.processando.set(false);
          this.auditoria.registrar({
            acao: 'CARGA_PROCESSADA',
            entidade: 'IMPORTACAO',
            entidadeId: importacao.id,
            detalhes: {
              arquivo: importacao.arquivo,
              tipoBase: importacao.tipoBase,
              modo: importacao.modo,
              status: importacao.status,
            },
          });
          this.carregarHistorico();
        },
        error: (erro: unknown) => {
          this.erroProcesso.set(mensagemDe(erro, 'Não consegui processar a carga.'));
          this.processando.set(false);
        },
      });
  }

  carregarHistorico(): void {
    this.carregandoHistorico.set(true);
    this.erroHistorico.set(null);

    this.uploads.historico({ limit: 50, page: 1 }).subscribe({
      next: (pagina) => {
        this.historico.set(pagina.data);
        this.carregandoHistorico.set(false);
      },
      error: (erro: unknown) => {
        this.erroHistorico.set(mensagemDe(erro, 'Não consegui carregar o histórico de cargas.'));
        this.carregandoHistorico.set(false);
      },
    });
  }

  carregarLayouts(): void {
    this.carregandoLayouts.set(true);
    this.erroLayouts.set(null);

    this.uploads.layouts().subscribe({
      next: (layouts) => {
        this.layouts.set(layouts);
        this.carregandoLayouts.set(false);
      },
      error: (erro: unknown) => {
        this.erroLayouts.set(mensagemDe(erro, 'Não consegui carregar os layouts esperados.'));
        this.carregandoLayouts.set(false);
      },
    });
  }

  abrirErros(importacao: Importacao): void {
    if (importacao.totalErros <= 0) return;

    // Segundo clique na mesma linha fecha o detalhe.
    if (this.importacaoSelecionada() === importacao.id) {
      this.importacaoSelecionada.set(null);
      this.errosImportacao.set(null);
      return;
    }

    this.importacaoSelecionada.set(importacao.id);
    this.errosImportacao.set(null);
    this.erroErros.set(null);
    this.carregandoErros.set(true);

    this.uploads.erros(importacao.id, { limit: 200, page: 1 }).subscribe({
      next: (pagina) => {
        this.errosImportacao.set({
          importacaoId: importacao.id,
          colunas: chavesDe(pagina.data),
          linhas: pagina.data,
        });
        this.carregandoErros.set(false);
      },
      error: (erro: unknown) => {
        this.erroErros.set(mensagemDe(erro, 'Não consegui carregar os erros desta carga.'));
        this.carregandoErros.set(false);
      },
    });
  }

  classeStatus(status: StatusImportacao): string {
    if (status === 'CONCLUIDA') return 'chip chip-ok';
    if (status === 'CONCLUIDA_COM_ERROS') return 'chip chip-atencao';
    return 'chip chip-erro';
  }

  rotuloStatus(status: StatusImportacao): string {
    if (status === 'CONCLUIDA') return 'Concluída';
    if (status === 'CONCLUIDA_COM_ERROS') return 'Concluída com erros';
    return 'Falhou';
  }

  valor(linha: Record<string, unknown>, chave: string): string {
    return textoDe(linha[chave]);
  }

  valorErro(erro: ErroLinha): string {
    return textoDe(erro.valor);
  }

  texto(valor: unknown): string {
    return textoDe(valor);
  }
}

function chavesDe(linhas: Array<Record<string, unknown>>): string[] {
  const chaves: string[] = [];
  for (const linha of linhas) {
    for (const chave of Object.keys(linha)) {
      if (!chaves.includes(chave)) chaves.push(chave);
    }
  }
  return chaves;
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
