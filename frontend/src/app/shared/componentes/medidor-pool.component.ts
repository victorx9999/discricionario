import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ResultadoPool } from '../../core/models/api.models';
import { MoedaPipe, PercentualPipe } from '../pipes/formatos.pipe';

/**
 * Pool do comitê: disponível, consumido e saldo.
 *
 * O pool é 1% da soma dos VLR_TEÓRICO dos participantes — o teto que a
 * consultoria tem para distribuir. Estouro é recusado pela API, então a barra
 * vermelha aqui é sempre um estado que já foi barrado, nunca um lançamento aceito.
 */
@Component({
  selector: 'app-medidor-pool',
  standalone: true,
  imports: [MoedaPipe, PercentualPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medidor-pool.component.html',
  styleUrl: './medidor-pool.component.scss',
})
export class MedidorPoolComponent {
  readonly pool = input.required<ResultadoPool | null>();
  readonly compacto = input(false);

  readonly largura = computed(() => {
    const atual = this.pool();
    if (!atual) return 0;
    return Math.min(100, Math.max(0, atual.percentualUtilizado));
  });

  readonly classeBarra = computed(() => {
    const atual = this.pool();
    if (!atual) return '';
    if (atual.excedido || atual.percentualUtilizado > 100) return 'excedido';
    if (atual.percentualUtilizado > 85) return 'alto';
    return '';
  });
}
