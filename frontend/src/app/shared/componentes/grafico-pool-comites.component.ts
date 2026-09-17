import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MoedaPipe } from '../pipes/formatos.pipe';

export interface PoolPorComite {
  comiteId: string;
  grupoRanking: string;
  poolDisponivel: number;
  poolConsumido: number;
  percentualUtilizado: number;
  excedido: boolean;
}

interface LinhaMeter extends PoolPorComite {
  /** Largura da trilha (pool disponível), relativa ao maior disponível da lista. */
  trilhaPct: number;
  /** Largura do preenchimento (pool consumido), na mesma escala da trilha. */
  preenchidoPct: number;
  severidade: 'ok' | 'atencao' | 'critico';
}

/**
 * Pool disponível x consumido, um "meter" por comitê selecionado.
 *
 * Todas as trilhas usam a mesma escala (o maior pool disponível do grupo),
 * então o comprimento da barra também compara o tamanho do pool entre
 * comitês — não só o quanto cada um consumiu do próprio teto.
 */
@Component({
  selector: 'app-grafico-pool-comites',
  standalone: true,
  imports: [MoedaPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './grafico-pool-comites.component.html',
  styleUrl: './grafico-pool-comites.component.scss',
})
export class GraficoPoolComitesComponent {
  readonly dados = input.required<PoolPorComite[]>();

  readonly linhas = computed<LinhaMeter[]>(() => {
    const itens = this.dados();
    const maiorDisponivel = Math.max(1, ...itens.map((item) => item.poolDisponivel));

    return itens.map((item) => ({
      ...item,
      trilhaPct: (item.poolDisponivel / maiorDisponivel) * 100,
      preenchidoPct: Math.min((item.poolConsumido / maiorDisponivel) * 100, 100),
      severidade: item.excedido ? 'critico' : item.percentualUtilizado >= 90 ? 'atencao' : 'ok',
    }));
  });
}
