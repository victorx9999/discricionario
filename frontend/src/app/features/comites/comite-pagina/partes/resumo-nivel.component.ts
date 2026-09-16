import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BlocoModelo, LinhaResumoNivel, ResumoComite } from '../../../../core/models/api.models';

/**
 * Resumo por nível de cargo × modelo de avaliação.
 *
 * É o primeiro bloco da tela porque é o que enquadra a conversa: quantos há em
 * cada nível, quantos podem receber discricionário (o teto de 1/3) e quantos já
 * receberam. Quando o nível estoura o teto, a checagem vira REVER — o comitê
 * pode concluir assim, mas a marca fica registrada.
 */
@Component({
  selector: 'app-resumo-nivel',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resumo-nivel.component.html',
  styleUrl: './resumo-nivel.component.scss',
})
export class ResumoNivelComponent {
  readonly resumo = input.required<ResumoComite>();

  readonly linhas = computed<LinhaResumoNivel[]>(() => this.resumo().porNivelCargo);

  readonly precisaRever = computed(() => this.resumo().precisaRever);

  readonly niveisEmRevisao = computed(() =>
    this.linhas()
      .flatMap((linha) => [
        { nivel: linha.nivel, modelo: 'Institucional', bloco: linha.institucional },
        { nivel: linha.nivel, modelo: 'Comunidade', bloco: linha.comunidade },
      ])
      .filter((item) => item.bloco.hcTotal > 0 && item.bloco.checagem === 'REVER'),
  );

  /** Nível/modelo sem ninguém não recebe chip de checagem — não há o que checar. */
  vazio(bloco: BlocoModelo): boolean {
    return bloco.hcTotal === 0;
  }
}
