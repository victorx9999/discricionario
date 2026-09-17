import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ContagemDiscricionarios {
  positivos: number;
  negativos: number;
}

interface BarraContagem {
  rotulo: string;
  valor: number;
  classe: 'positivo' | 'negativo';
  larguraPct: number;
}

/** Quantidade de discricionários positivos x negativos nos comitês selecionados. */
@Component({
  selector: 'app-grafico-discricionarios',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grafico-discricionarios.component.html',
  styleUrl: './grafico-discricionarios.component.scss',
})
export class GraficoDiscricionariosComponent {
  readonly dados = input.required<ContagemDiscricionarios>();

  readonly barras = computed<BarraContagem[]>(() => {
    const { positivos, negativos } = this.dados();
    const maior = Math.max(1, positivos, negativos);

    return [
      { rotulo: 'Positivos', valor: positivos, classe: 'positivo', larguraPct: (positivos / maior) * 100 },
      { rotulo: 'Negativos', valor: negativos, classe: 'negativo', larguraPct: (negativos / maior) * 100 },
    ];
  });

  readonly total = computed(() => this.dados().positivos + this.dados().negativos);
}
