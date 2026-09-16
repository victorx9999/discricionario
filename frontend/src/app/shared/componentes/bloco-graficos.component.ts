import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { GraficosParticipante, PontoSerie } from '../../core/models/api.models';
import { MoedaPipe, VariacaoPipe } from '../pipes/formatos.pipe';

interface SerieDesenhada {
  chave: 'rv' | 'tc' | 'tcs';
  nome: string;
  cor: string;
  pontos: Array<{ ano: number; valor: number; x: number; y: number }>;
  caminho: string;
  ultimo: { ano: number; valor: number; x: number; y: number } | null;
  variacao: number | null;
}

interface FaixaAno {
  ano: number;
  x: number;
  largura: number;
  valores: Array<{ nome: string; cor: string; valor: number }>;
}

const LARGURA = 340;
const ALTURA = 136;
const ESQUERDA = 42;
const DIREITA = LARGURA - 10;
const TOPO = 12;
const BASE = ALTURA - 18;

/**
 * RV, Total Cash e TC + P. Sócios num bloco só.
 *
 * As três séries são valores em reais na mesma escala, então cabem no mesmo
 * eixo — que é o que permite ler a estratificação da remuneração de uma vez.
 * TC + P. Sócios só existe nos dois últimos anos (a API só devolve o par
 * comparativo), e a linha começa de onde a série começa.
 *
 * SVG à mão em vez de biblioteca: são no máximo quatro pontos por série, e o
 * desenho segue os tokens de tema, funcionando em claro e escuro sem configuração.
 */
@Component({
  selector: 'app-bloco-graficos',
  standalone: true,
  imports: [MoedaPipe, VariacaoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bloco-graficos.component.html',
  styleUrl: './bloco-graficos.component.scss',
})
export class BlocoGraficosComponent {
  readonly dados = input.required<GraficosParticipante | null>();

  readonly larguraSvg = LARGURA;
  readonly alturaSvg = ALTURA;
  readonly base = BASE;
  readonly esquerda = ESQUERDA;
  readonly direita = DIREITA;

  /**
   * Ano destacado pelo mouse; `null` esconde a dica.
   *
   * Precisa ser signal: `faixaEmFoco` é um `computed` e só reage a leituras de
   * signals — com um campo simples a dica nunca reapareceria.
   */
  private readonly anoEmFoco = signal<number | null>(null);

  private readonly anos = computed<number[]>(() => {
    const dados = this.dados();
    if (!dados) return [];

    const conjunto = new Set<number>();
    for (const serie of this.seriesBrutas(dados)) {
      for (const ponto of serie) conjunto.add(ponto.ano);
    }
    return [...conjunto].sort((a, b) => a - b);
  });

  private readonly limites = computed<{ min: number; max: number }>(() => {
    const dados = this.dados();
    const valores: number[] = [];
    if (dados) {
      for (const serie of this.seriesBrutas(dados)) {
        for (const ponto of serie) valores.push(ponto.valor);
      }
    }
    if (!valores.length) return { min: 0, max: 1 };
    return { min: Math.min(...valores), max: Math.max(...valores) };
  });

  readonly series = computed<SerieDesenhada[]>(() => {
    const dados = this.dados();
    if (!dados) return [];

    const definicoes: Array<{ chave: SerieDesenhada['chave']; nome: string; cor: string; pontos: PontoSerie[]; variacao: number | null }> = [
      {
        chave: 'rv',
        nome: 'RV',
        cor: 'var(--serie-rv)',
        pontos: dados.series.remuneracaoVariavel,
        variacao: dados.variacoes.percentualRv,
      },
      {
        chave: 'tc',
        nome: 'TC',
        cor: 'var(--serie-tc)',
        pontos: dados.series.totalCash,
        variacao: dados.variacoes.percentualTc,
      },
      {
        chave: 'tcs',
        nome: 'TC + P. Sócios',
        cor: 'var(--serie-tcs)',
        pontos: dados.series.totalCashMaisSocios,
        variacao: dados.variacoes.deltaTcMaisSocios,
      },
    ];

    return definicoes.map((definicao) => {
      const pontos = definicao.pontos
        .filter((ponto) => Number.isFinite(ponto.valor))
        .map((ponto) => ({
          ano: ponto.ano,
          valor: ponto.valor,
          x: this.x(ponto.ano),
          y: this.y(ponto.valor),
        }));

      const caminho = pontos
        .map((ponto, indice) => `${indice === 0 ? 'M' : 'L'} ${ponto.x.toFixed(1)} ${ponto.y.toFixed(1)}`)
        .join(' ');

      return {
        chave: definicao.chave,
        nome: definicao.nome,
        cor: definicao.cor,
        pontos,
        caminho,
        ultimo: pontos.length ? pontos[pontos.length - 1] : null,
        variacao: definicao.variacao,
      };
    });
  });

  /** Grade só no menor e no maior valor — rótulos nomeiam valores reais. */
  readonly linhasGrade = computed(() => {
    const { min, max } = this.limites();
    return [
      { valor: min, y: this.y(min), comRotulo: true },
      { valor: max, y: this.y(max), comRotulo: false },
    ];
  });

  readonly marcasAno = computed(() =>
    this.anos().map((ano) => ({ ano, x: this.x(ano) })),
  );

  /** Faixas invisíveis que capturam o mouse por ano inteiro, não por ponto. */
  readonly faixas = computed<FaixaAno[]>(() => {
    const anos = this.anos();
    if (anos.length < 2) return [];

    const passo = (DIREITA - ESQUERDA) / (anos.length - 1);
    return anos.map((ano) => ({
      ano,
      x: this.x(ano) - passo / 2,
      largura: passo,
      valores: this.series()
        .map((serie) => {
          const ponto = serie.pontos.find((item) => item.ano === ano);
          return ponto ? { nome: serie.nome, cor: serie.cor, valor: ponto.valor } : null;
        })
        .filter((item): item is { nome: string; cor: string; valor: number } => item !== null),
    }));
  });

  readonly faixaEmFoco = computed(() =>
    this.faixas().find((faixa) => faixa.ano === this.anoEmFoco()) ?? null,
  );

  readonly periodo = computed(() => {
    const anos = this.anos();
    if (!anos.length) return '';
    return anos.length === 1 ? String(anos[0]) : `${anos[0]} – ${anos[anos.length - 1]}`;
  });

  focar(ano: number): void {
    this.anoEmFoco.set(ano);
  }

  desfocar(): void {
    this.anoEmFoco.set(null);
  }

  /** Abrevia em milhares para o rótulo caber no gráfico. */
  curto(valor: number): string {
    if (Math.abs(valor) >= 1000) return `${Math.round(valor / 1000)}k`;
    return String(Math.round(valor));
  }

  private seriesBrutas(dados: GraficosParticipante): PontoSerie[][] {
    return [
      dados.series.remuneracaoVariavel,
      dados.series.totalCash,
      dados.series.totalCashMaisSocios,
    ];
  }

  private x(ano: number): number {
    const anos = this.anos();
    if (anos.length <= 1) return (ESQUERDA + DIREITA) / 2;
    const indice = anos.indexOf(ano);
    if (indice < 0) return ESQUERDA;
    return ESQUERDA + (indice / (anos.length - 1)) * (DIREITA - ESQUERDA);
  }

  private y(valor: number): number {
    const { min, max } = this.limites();
    // Eixo truncado de propósito: com piso em zero, uma variação de 15% no PR
    // vira uma inclinação imperceptível. Os rótulos da grade nomeiam os limites.
    const piso = min * 0.86;
    const teto = max * 1.07;
    if (teto === piso) return (TOPO + BASE) / 2;
    return BASE - ((valor - piso) / (teto - piso)) * (BASE - TOPO);
  }
}
