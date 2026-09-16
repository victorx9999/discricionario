import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalculoService, PremissasCalculo, ResultadoPool } from '../../calculo/calculo.service';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { ModeloAvaliacao, ResultadoChecagem } from '../../common/enums';
import { paraMoeda } from '../../common/utils';
import { Participante } from '../../participantes/entities/participante.entity';

/** Bloco de um modelo de avaliação dentro de um nível de cargo. */
export interface BlocoModelo {
  modelo: string;
  hcTotal: number;
  hcMaximo: number;
  reducao: number;
  aumento: number;
  hcComDiscricionario: number;
  checagem: ResultadoChecagem;
  discricionarioPositivo: number;
  discricionarioNegativo: number;
  saldo: number;
}

/** Linha da tabela "Resumo por Nível de Cargo". */
export interface LinhaResumoNivel {
  nivel: string;
  totalHc: number;
  modelos: BlocoModelo[];
  /** Atalho para a leitura da tela, que separa Institucional e Comunidade. */
  institucional: BlocoModelo;
  comunidade: BlocoModelo;
}

export interface PerformancePonderada {
  antes: number | null;
  depois: number | null;
  variacao: number | null;
  modelo: string;
}

export interface ResumoComite {
  comiteId: string;
  ciclo: number;
  totalParticipantes: number;
  analisados: number;
  pendentesDeAnalise: number;
  pendencias: number;
  porNivelCargo: LinhaResumoNivel[];
  porModeloAvaliacao: BlocoModelo[];
  performancePonderada: PerformancePonderada;
  pool: ResultadoPool;
  precisaRever: boolean;
}

const MODELOS = [ModeloAvaliacao.INSTITUCIONAL, ModeloAvaliacao.COMUNIDADE] as const;

/**
 * Resumos consolidados do comitê (seções 3.3, 3.4 e 5.3).
 *
 * Os participantes do comitê são carregados uma vez com seus acréscimos e
 * todos os números — HC por nível/modelo, performance ponderada e pool —
 * saem do mesmo conjunto, garantindo que a tela nunca mostre dois totais
 * que não fecham entre si.
 */
@Injectable()
export class ResumoComiteService {
  constructor(
    @InjectRepository(Participante) private readonly participantes: Repository<Participante>,
    private readonly calculoService: CalculoService,
  ) {}

  async resumir(comiteId: string, ciclo: Ciclo): Promise<ResumoComite> {
    const participantes = await this.participantes.find({
      where: { comiteId },
      relations: { acrescimos: true },
    });

    const premissas = this.premissas(ciclo);
    const linhas = participantes.map((participante) => this.calcularLinha(participante, premissas));

    const porNivelCargo = this.agruparPorNivel(linhas, premissas);
    const porModeloAvaliacao = MODELOS.map((modelo) =>
      this.montarBloco(
        modelo,
        linhas.filter((linha) => this.modeloDe(linha.participante) === modelo),
        premissas,
      ),
    );

    const vlrTeorico = linhas.reduce((total, linha) => total + linha.vlrTeoricoTotal, 0);
    const consumido = linhas.reduce((total, linha) => total + linha.diferenca, 0);

    return {
      comiteId,
      ciclo: ciclo.ano,
      totalParticipantes: linhas.length,
      analisados: linhas.filter((linha) => linha.temDiscricionario).length,
      pendentesDeAnalise: linhas.filter((linha) => !linha.temDiscricionario).length,
      pendencias: linhas.filter((linha) => linha.participante.pendente).length,
      porNivelCargo,
      porModeloAvaliacao,
      performancePonderada: this.calcularPerformancePonderada(linhas, ciclo),
      pool: this.calculoService.consolidarPool(vlrTeorico, consumido, premissas.percentualPool),
      precisaRever: porNivelCargo.some((linha) =>
        linha.modelos.some((bloco) => bloco.checagem === ResultadoChecagem.REVER),
      ),
    };
  }

  /** Pool isolado, para a aba "Distribuição do Pool". */
  async pool(comiteId: string, ciclo: Ciclo): Promise<ResultadoPool> {
    const resumo = await this.resumir(comiteId, ciclo);
    return resumo.pool;
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  premissas(ciclo: Ciclo): PremissasCalculo {
    return {
      percentualPool: Number(ciclo.percentualPool),
      limiteFd: Number(ciclo.limiteFd),
      divisorHcMax: Number(ciclo.divisorHcMax),
      fatorPep: Number(ciclo.fatorPep),
      fatorDiferimento: Number(ciclo.fatorDiferimento),
    };
  }

  private calcularLinha(participante: Participante, premissas: PremissasCalculo) {
    const elegiveis = (participante.acrescimos ?? []).filter((acrescimo) => acrescimo.elegivel);
    const calculo = this.calculoService.calcularParticipante(participante, elegiveis, premissas);

    return {
      participante,
      nivel: participante.xlatlongname?.trim() || 'Não informado',
      fd: calculo.fd,
      fpi: calculo.fpi,
      fpiFinal: calculo.fpiFinal,
      vlBaseMes: Number(participante.vlBaseMes),
      diferenca: calculo.diferencaDiscricionario,
      vlrTeoricoTotal: calculo.vlrTeoricoTotal,
      temDiscricionario: calculo.fd !== 0,
    };
  }

  private modeloDe(participante: Participante): string {
    const modelo = (participante.modeloAvaliacao ?? '').trim().toLowerCase();
    if (modelo === 'comunidade') return ModeloAvaliacao.COMUNIDADE;
    if (modelo === 'institucional') return ModeloAvaliacao.INSTITUCIONAL;
    return ModeloAvaliacao.INSTITUCIONAL;
  }

  private agruparPorNivel(
    linhas: ReturnType<ResumoComiteService['calcularLinha']>[],
    premissas: PremissasCalculo,
  ): LinhaResumoNivel[] {
    const porNivel = new Map<string, typeof linhas>();

    for (const linha of linhas) {
      const atual = porNivel.get(linha.nivel) ?? [];
      atual.push(linha);
      porNivel.set(linha.nivel, atual);
    }

    return [...porNivel.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([nivel, doNivel]) => {
        const modelos = MODELOS.map((modelo) =>
          this.montarBloco(
            modelo,
            doNivel.filter((linha) => this.modeloDe(linha.participante) === modelo),
            premissas,
          ),
        );

        return {
          nivel,
          totalHc: doNivel.length,
          modelos,
          institucional: modelos[0],
          comunidade: modelos[1],
        };
      });
  }

  private montarBloco(
    modelo: string,
    linhas: ReturnType<ResumoComiteService['calcularLinha']>[],
    premissas: PremissasCalculo,
  ): BlocoModelo {
    const hcTotal = linhas.length;
    const hcMaximo = this.calculoService.calcularHcMaximo(hcTotal, premissas.divisorHcMax);

    const reducao = linhas.filter((linha) => linha.fd < 0).length;
    const aumento = linhas.filter((linha) => linha.fd > 0).length;
    const hcComDiscricionario = reducao + aumento;

    const positivo = linhas.filter((l) => l.diferenca > 0).reduce((t, l) => t + l.diferenca, 0);
    const negativo = linhas.filter((l) => l.diferenca < 0).reduce((t, l) => t + l.diferenca, 0);

    return {
      modelo,
      hcTotal,
      hcMaximo,
      reducao,
      aumento,
      hcComDiscricionario,
      checagem: this.calculoService.checar(hcComDiscricionario, hcMaximo),
      discricionarioPositivo: paraMoeda(positivo),
      discricionarioNegativo: paraMoeda(negativo),
      saldo: paraMoeda(positivo + negativo),
    };
  }

  /**
   * Perf. ponderada por VB = Σ(VLBASEMES × FPI) ÷ Σ(VLBASEMES).
   * Calculada antes (FPI) e depois (FPI_FINAL), restrita ao tipo de simulador
   * configurado nas premissas — Institucional, por padrão.
   */
  private calcularPerformancePonderada(
    linhas: ReturnType<ResumoComiteService['calcularLinha']>[],
    ciclo: Ciclo,
  ): PerformancePonderada {
    const modeloAlvo = (ciclo.tipoSimuladorPerformance ?? 'Institucional').trim().toLowerCase();
    const doModelo = linhas.filter(
      (linha) => this.modeloDe(linha.participante).toLowerCase() === modeloAlvo,
    );
    const base = doModelo.length ? doModelo : linhas;

    const antes = this.calculoService.calcularPerformancePonderada(
      base.map((linha) => ({ vlBaseMes: linha.vlBaseMes, fator: linha.fpi })),
    );
    const depois = this.calculoService.calcularPerformancePonderada(
      base.map((linha) => ({ vlBaseMes: linha.vlBaseMes, fator: linha.fpiFinal })),
    );

    return {
      modelo: ciclo.tipoSimuladorPerformance ?? 'Institucional',
      antes,
      depois,
      variacao: antes !== null && depois !== null ? Number((depois - antes).toFixed(6)) : null,
    };
  }
}
