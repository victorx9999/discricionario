import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ComitesService } from '../../core/http/comites.service';
import {
  ColunaResolvida,
  ContextoColuna,
  LayoutComite,
  SalvarColunas,
} from '../../core/models/api.models';

interface GrupoCampos {
  nome: string;
  campos: ColunaResolvida[];
}

/**
 * Personalização do comitê: o que a consultoria vê.
 *
 * São dois layouts independentes sobre o mesmo catálogo de campos — as colunas
 * da tabela e os campos de valor do painel de análise. Quem monta é o
 * Atendimento; a consultoria abre o comitê já configurado.
 */
@Component({
  selector: 'app-personalizar-comite',
  standalone: true,
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatTooltipModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './personalizar-comite.component.html',
  styleUrl: './personalizar-comite.component.scss',
})
export class PersonalizarComiteComponent {
  private readonly comites = inject(ComitesService);

  readonly comiteId = input.required<string>();
  readonly layout = input.required<LayoutComite>();
  readonly editavel = input(true);

  readonly salvo = output<LayoutComite>();
  readonly fechar = output<void>();

  private readonly rascunhoTabela = signal<ColunaResolvida[] | null>(null);
  private readonly rascunhoPainel = signal<ColunaResolvida[] | null>(null);

  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly camposTabela = computed(
    () => this.rascunhoTabela() ?? ordenar(this.layout().tabela.colunas),
  );
  readonly camposPainel = computed(
    () => this.rascunhoPainel() ?? ordenar(this.layout().painel.colunas),
  );

  readonly visiveisTabela = computed(() => this.camposTabela().filter((c) => c.visivel));
  readonly visiveisPainel = computed(() => this.camposPainel().filter((c) => c.visivel));

  /** Disponíveis ficam agrupados pelas seções do catálogo, para dar contexto. */
  readonly disponiveisTabela = computed(() => agrupar(this.camposTabela().filter((c) => !c.visivel)));
  readonly disponiveisPainel = computed(() => agrupar(this.camposPainel().filter((c) => !c.visivel)));

  alternar(contexto: ContextoColuna, chave: string): void {
    if (!this.editavel()) return;
    const atual = contexto === 'TABELA' ? this.camposTabela() : this.camposPainel();
    const proximo = atual.map((campo) =>
      campo.chave === chave ? { ...campo, visivel: !campo.visivel } : campo,
    );
    this.gravarRascunho(contexto, reordenar(proximo));
  }

  mover(contexto: ContextoColuna, evento: CdkDragDrop<ColunaResolvida[]>): void {
    if (!this.editavel()) return;
    const todos = contexto === 'TABELA' ? [...this.camposTabela()] : [...this.camposPainel()];
    const visiveis = todos.filter((campo) => campo.visivel);

    moveItemInArray(visiveis, evento.previousIndex, evento.currentIndex);

    const invisiveis = todos.filter((campo) => !campo.visivel);
    this.gravarRascunho(contexto, reordenar([...visiveis, ...invisiveis]));
  }

  salvar(): void {
    if (!this.editavel() || this.salvando()) return;

    this.salvando.set(true);
    this.erro.set(null);

    const corpoTabela: SalvarColunas = {
      contexto: 'TABELA',
      colunas: this.camposTabela().map((campo, indice) => ({
        chave: campo.chave,
        visivel: campo.visivel,
        ordem: indice,
        largura: campo.largura ?? undefined,
        fixa: campo.fixa,
      })),
    };

    const corpoPainel: SalvarColunas = {
      contexto: 'PAINEL',
      colunas: this.camposPainel().map((campo, indice) => ({
        chave: campo.chave,
        visivel: campo.visivel,
        ordem: indice,
      })),
    };

    // Salva os dois contextos em sequência e recarrega o layout inteiro, para
    // a tela nunca ficar com metade do que foi gravado.
    this.comites.salvarLayout(this.comiteId(), corpoTabela).subscribe({
      next: () =>
        this.comites.salvarLayout(this.comiteId(), corpoPainel).subscribe({
          next: () => this.recarregar(),
          error: () => this.falhar(),
        }),
      error: () => this.falhar(),
    });
  }

  restaurarPadrao(): void {
    if (!this.editavel() || this.salvando()) return;
    this.salvando.set(true);
    this.erro.set(null);
    this.comites.restaurarLayout(this.comiteId()).subscribe({
      next: () => this.recarregar(),
      error: () => this.falhar(),
    });
  }

  descartar(): void {
    this.rascunhoTabela.set(null);
    this.rascunhoPainel.set(null);
    this.erro.set(null);
    this.fechar.emit();
  }

  private gravarRascunho(contexto: ContextoColuna, campos: ColunaResolvida[]): void {
    if (contexto === 'TABELA') this.rascunhoTabela.set(campos);
    else this.rascunhoPainel.set(campos);
  }

  private recarregar(): void {
    this.comites.layout(this.comiteId()).subscribe({
      next: (layout) => {
        this.rascunhoTabela.set(null);
        this.rascunhoPainel.set(null);
        this.salvando.set(false);
        this.salvo.emit(layout);
      },
      error: () => this.falhar(),
    });
  }

  private falhar(): void {
    this.salvando.set(false);
    this.erro.set('Não consegui salvar o layout. Tente de novo.');
  }
}

function ordenar(campos: ColunaResolvida[]): ColunaResolvida[] {
  return [...campos].sort((a, b) => a.ordem - b.ordem);
}

function reordenar(campos: ColunaResolvida[]): ColunaResolvida[] {
  return campos.map((campo, indice) => ({ ...campo, ordem: indice }));
}

function agrupar(campos: ColunaResolvida[]): GrupoCampos[] {
  const mapa = new Map<string, ColunaResolvida[]>();
  for (const campo of campos) {
    const lista = mapa.get(campo.grupo) ?? [];
    lista.push(campo);
    mapa.set(campo.grupo, lista);
  }
  return [...mapa.entries()].map(([nome, lista]) => ({ nome, campos: lista }));
}
