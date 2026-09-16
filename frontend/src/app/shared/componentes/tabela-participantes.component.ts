import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ColunaResolvida, ParticipanteLinha } from '../../core/models/api.models';
import { CelulaPipe, TIPOS_NUMERICOS } from '../pipes/formatos.pipe';

/**
 * Tabela de participantes montada a partir do layout do comitê.
 *
 * As colunas não são fixas no template: vêm de `GET /comites/:id/colunas`, e o
 * catálogo diz o rótulo, o tipo e a largura de cada uma. Assim o Atendimento
 * monta a tabela de cada comitê e a consultoria recebe pronta, sem configurar nada.
 */
@Component({
  selector: 'app-tabela-participantes',
  standalone: true,
  imports: [MatTableModule, MatIconModule, MatTooltipModule, CelulaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabela-participantes.component.html',
  styleUrl: './tabela-participantes.component.scss',
})
export class TabelaParticipantesComponent {
  readonly linhas = input.required<ParticipanteLinha[]>();
  readonly colunas = input.required<ColunaResolvida[]>();
  readonly selecionadoId = input<string | null>(null);

  readonly selecionar = output<ParticipanteLinha>();

  /** O nome é sempre a primeira coluna: é o que identifica a linha na reunião. */
  readonly colunasVisiveis = computed(() =>
    this.colunas()
      .filter((coluna) => coluna.visivel && coluna.chave !== 'nome')
      .sort((a, b) => a.ordem - b.ordem),
  );

  readonly chavesExibidas = computed(() => ['nome', ...this.colunasVisiveis().map((c) => c.chave)]);

  valorDe(linha: ParticipanteLinha, chave: string): unknown {
    return (linha as unknown as Record<string, unknown>)[chave];
  }

  ehNumerica(tipo: string): boolean {
    return TIPOS_NUMERICOS.has(tipo);
  }

  /** Impacto no pool ganha cor: verde soma, vermelho devolve verba. */
  classeValor(linha: ParticipanteLinha, chave: string): string {
    if (chave !== 'diferencaDiscricionario') return '';
    if (linha.diferencaDiscricionario > 0) return 'positivo';
    if (linha.diferencaDiscricionario < 0) return 'negativo';
    return '';
  }

  aoClicar(linha: ParticipanteLinha): void {
    this.selecionar.emit(linha);
  }
}
