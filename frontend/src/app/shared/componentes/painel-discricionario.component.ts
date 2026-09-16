import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MotivosService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import { ParticipantesService } from '../../core/http/participantes.service';
import {
  Ciclo,
  ErroApi,
  mensagemDoErro,
  Motivo,
  ParticipanteLinha,
  ResultadoPool,
} from '../../core/models/api.models';
import { MoedaPipe } from '../pipes/formatos.pipe';

/**
 * Lançamento do fator discricionário.
 *
 * O único ponto do sistema que grava decisão. Tudo que é conta — FPI_FINAL,
 * PR pós, impacto no pool — vem calculado da API: aqui só se escolhe o FD, o
 * motivador e a justificativa, e se mostra o que a API respondeu.
 *
 * O preview de impacto usa o participante já carregado, que traz os valores do
 * FD atualmente salvo. Enquanto o slider se move, o texto mostra a projeção
 * simples e avisa que o número final vem da API — é assim que tela e relatório
 * nunca divergem por arredondamento.
 */
@Component({
  selector: 'app-painel-discricionario',
  standalone: true,
  imports: [
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MoedaPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel-discricionario.component.html',
  styleUrl: './painel-discricionario.component.scss',
})
export class PainelDiscricionarioComponent {
  private readonly participantes = inject(ParticipantesService);
  private readonly motivos = inject(MotivosService);

  readonly participante = input.required<ParticipanteLinha | null>();
  readonly ciclo = input<Ciclo | null>(null);
  readonly pool = input<ResultadoPool | null>(null);
  readonly somenteLeitura = input(false);

  readonly lancado = output<ParticipanteLinha>();
  readonly avancar = output<void>();

  readonly motivadores = signal<Motivo[]>([]);
  readonly salvando = signal(false);
  readonly erroApi = signal<ErroApi | null>(null);

  /** FD em pontos percentuais — é como o comitê fala e como o slider trabalha. */
  readonly fdPp = signal(0);
  readonly codMotivador = signal<number | null>(null);
  readonly justificativa = signal('');

  readonly limiteCiclo = computed(() => (this.ciclo()?.limiteFd ?? 0.15) * 100);

  readonly motivoSelecionado = computed(() =>
    this.motivadores().find((motivo) => motivo.codigo === this.codMotivador()) ?? null,
  );

  /** O limite do motivador nunca afrouxa o do ciclo — vale o mais restritivo. */
  readonly limiteEfetivo = computed(() => {
    const doMotivo = this.motivoSelecionado()?.limiteFd;
    const doCiclo = this.limiteCiclo();
    if (doMotivo === null || doMotivo === undefined) return doCiclo;
    return Math.min(doCiclo, doMotivo * 100);
  });

  readonly zerando = computed(() => this.fdPp() === 0);

  readonly alterado = computed(() => {
    const atual = this.participante();
    if (!atual) return false;
    const mesmoFd = Math.abs(atual.fd * 100 - this.fdPp()) < 0.0001;
    const mesmoMotivo = (atual.codMotivador ?? null) === this.codMotivador();
    const mesmaJustificativa = (atual.observacaoPoscomite ?? '') === this.justificativa();
    return !(mesmoFd && mesmoMotivo && mesmaJustificativa);
  });

  /** Projeção local só para orientar o slider: o valor gravado vem da API. */
  readonly impactoProjetado = computed(() => {
    const atual = this.participante();
    if (!atual) return 0;
    const fpiFinal = atual.fpi + this.fdPp() / 100;
    const base = atual.fpi === 0 ? 0 : atual.vlPrI / atual.fpi;
    const projetado = base * fpiFinal;
    const acrescimos = atual.prSemDiscricionario - atual.vlPrI;
    const acrescimosProjetados = atual.fpi === 0 ? acrescimos : (acrescimos / atual.fpi) * fpiFinal;
    return projetado + acrescimosProjetados - atual.prSemDiscricionario;
  });

  readonly saldoProjetado = computed(() => {
    const pool = this.pool();
    const atual = this.participante();
    if (!pool || !atual) return null;
    // Tira o consumo atual dele e põe o projetado no lugar.
    const consumoSemEle = pool.poolConsumido - atual.diferencaDiscricionario;
    return pool.poolDisponivel - (consumoSemEle + this.impactoProjetado());
  });

  readonly foraDoLimite = computed(() => Math.abs(this.fdPp()) > this.limiteEfetivo() + 0.0001);

  readonly faltaJustificar = computed(
    () => !this.zerando() && (!this.codMotivador() || !this.justificativa().trim()),
  );

  readonly podeSalvar = computed(
    () =>
      !this.somenteLeitura() &&
      !this.salvando() &&
      !this.foraDoLimite() &&
      !this.faltaJustificar() &&
      this.alterado(),
  );

  readonly mensagemErro = computed(() => mensagemDoErro(this.erroApi()));

  constructor() {
    this.motivos.ativos().subscribe({
      next: (lista) => this.motivadores.set(lista),
      error: () => this.motivadores.set([]),
    });

    // Trocar de participante recarrega o formulário com o que está gravado.
    effect(() => {
      const atual = this.participante();
      this.erroApi.set(null);
      if (!atual) {
        this.fdPp.set(0);
        this.codMotivador.set(null);
        this.justificativa.set('');
        return;
      }
      this.fdPp.set(Number((atual.fd * 100).toFixed(1)));
      this.codMotivador.set(atual.codMotivador);
      this.justificativa.set(atual.observacaoPoscomite ?? '');
    }, { allowSignalWrites: true });
  }

  salvar(avancarDepois: boolean): void {
    const atual = this.participante();
    if (!atual || !this.podeSalvar()) return;

    this.salvando.set(true);
    this.erroApi.set(null);

    const requisicao = this.zerando()
      ? this.participantes.removerDiscricionario(atual.id)
      : this.participantes.lancarDiscricionario(atual.id, {
          fd: Number((this.fdPp() / 100).toFixed(6)),
          codMotivador: this.codMotivador() ?? undefined,
          justificativa: this.justificativa().trim(),
        });

    requisicao.subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.lancado.emit(atualizado);
        if (avancarDepois) this.avancar.emit();
      },
      error: (falha: unknown) => {
        this.salvando.set(false);
        this.erroApi.set(erroApiDe(falha));
      },
    });
  }

  aoMoverSlider(valor: number): void {
    this.fdPp.set(valor);
  }

  zerar(): void {
    this.fdPp.set(0);
    this.codMotivador.set(null);
    this.justificativa.set('');
  }

  /** O slider do Material entrega number; a formatação do rótulo é nossa. */
  formatarPp = (valor: number): string => {
    if (valor === 0) return '0';
    return `${valor > 0 ? '+' : ''}${valor}`;
  };
}
