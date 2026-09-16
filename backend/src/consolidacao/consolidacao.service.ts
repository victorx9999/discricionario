import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { UsuarioAutenticado } from '../auth/decorators';
import { aplicarVisibilidadeComite } from '../auth/visibilidade';
import { CalculoService } from '../calculo/calculo.service';
import { CiclosService } from '../ciclos/ciclos.service';
import { Ciclo } from '../ciclos/entities/ciclo.entity';
import { StatusComite } from '../common/enums';
import { paraMoeda } from '../common/utils';
import { Comite } from '../comites/entities/comite.entity';
import { ResumoComite, ResumoComiteService } from '../comites/services/resumo.service';
import { Participante } from '../participantes/entities/participante.entity';

/**
 * Telas de consolidação (seção 6.4).
 *
 * Todos os números respeitam o ciclo escolhido e a visibilidade do perfil:
 * um Atendimento vê o consolidado dos comitês que criou e daqueles em que é
 * backup; a Consultoria, apenas os seus.
 */
@Injectable()
export class ConsolidacaoService {
  constructor(
    @InjectRepository(Comite) private readonly comites: Repository<Comite>,
    @InjectRepository(Participante) private readonly participantes: Repository<Participante>,
    private readonly ciclosService: CiclosService,
    private readonly resumoService: ResumoComiteService,
    private readonly calculoService: CalculoService,
  ) {}

  // ------------------------------------------------------------------
  // Visão geral
  // ------------------------------------------------------------------

  async visaoGeral(ano: number | undefined, usuario: UsuarioAutenticado) {
    const ciclo = await this.ciclosService.resolver(ano);
    const comites = await this.comitesVisiveis(ciclo, usuario);
    const resumos = await this.resumirTodos(comites, ciclo);

    const totais = resumos.reduce(
      (acumulado, { resumo }) => ({
        participantes: acumulado.participantes + resumo.totalParticipantes,
        analisados: acumulado.analisados + resumo.analisados,
        pendentesDeAnalise: acumulado.pendentesDeAnalise + resumo.pendentesDeAnalise,
        pendencias: acumulado.pendencias + resumo.pendencias,
        poolDisponivel: acumulado.poolDisponivel + resumo.pool.poolDisponivel,
        poolConsumido: acumulado.poolConsumido + resumo.pool.poolConsumido,
        vlrTeorico: acumulado.vlrTeorico + resumo.pool.vlrTeoricoTotal,
      }),
      {
        participantes: 0,
        analisados: 0,
        pendentesDeAnalise: 0,
        pendencias: 0,
        poolDisponivel: 0,
        poolConsumido: 0,
        vlrTeorico: 0,
      },
    );

    const elegiveisSemComite = await this.participantes.count({
      where: { cicloId: ciclo.id, comiteId: IsNull() },
    });

    const alertas = [
      ...resumos
        .filter(({ resumo }) => resumo.pool.excedido)
        .map(({ comite }) => ({
          tipo: 'POOL_EXCEDIDO',
          comiteId: comite.id,
          comite: comite.grupoRanking,
          mensagem: 'Pool excedido',
        })),
      ...comites
        .filter((comite) => !comite.ata)
        .map((comite) => ({
          tipo: 'COMITE_SEM_ATA',
          comiteId: comite.id,
          comite: comite.grupoRanking,
          mensagem: 'Comitê sem ATA cadastrada',
        })),
      ...resumos
        .filter(({ resumo }) => resumo.precisaRever)
        .map(({ comite }) => ({
          tipo: 'HC_ACIMA_DO_LIMITE',
          comiteId: comite.id,
          comite: comite.grupoRanking,
          mensagem: 'Há níveis com discricionários acima de 1/3 do HC',
        })),
      ...(elegiveisSemComite
        ? [
            {
              tipo: 'ELEGIVEIS_SEM_GRUPO',
              comiteId: null,
              comite: null,
              mensagem: `${elegiveisSemComite} elegível(is) ainda sem comitê`,
            },
          ]
        : []),
    ];

    return {
      ciclo: ciclo.ano,
      rotuloComparativo: ciclo.rotuloComparativo,
      kpis: {
        comites: comites.length,
        comitesConcluidos: comites.filter((comite) => comite.status === StatusComite.CONCLUIDO).length,
        comitesEmAndamento: comites.filter((comite) => comite.status === StatusComite.EM_ANDAMENTO)
          .length,
        participantes: totais.participantes,
        participantesAnalisados: totais.analisados,
        participantesPendentes: totais.pendentesDeAnalise,
        elegiveisSemComite,
        vlrTeoricoTotal: paraMoeda(totais.vlrTeorico),
        poolDisponivel: paraMoeda(totais.poolDisponivel),
        poolConsumido: paraMoeda(totais.poolConsumido),
        poolSaldo: paraMoeda(totais.poolDisponivel - totais.poolConsumido),
        percentualUtilizado: totais.poolDisponivel
          ? Number(((totais.poolConsumido / totais.poolDisponivel) * 100).toFixed(4))
          : 0,
      },
      alertas,
      graficos: await this.graficosGerais(resumos),
      porComite: resumos.map(({ comite, resumo }) => ({
        comiteId: comite.id,
        codigo: comite.codigo,
        nome: comite.nome,
        grupoRanking: comite.grupoRanking,
        status: comite.status,
        temAta: Boolean(comite.ata),
        participantes: resumo.totalParticipantes,
        analisados: resumo.analisados,
        pendencias: resumo.pendencias,
        poolDisponivel: resumo.pool.poolDisponivel,
        poolConsumido: resumo.pool.poolConsumido,
        saldo: resumo.pool.saldo,
        percentualUtilizado: resumo.pool.percentualUtilizado,
        excedido: resumo.pool.excedido,
        precisaRever: resumo.precisaRever,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Comparativo de grupos
  // ------------------------------------------------------------------

  /** Visão consolidada de vários comitês selecionados, para levar à discussão. */
  async comparativo(comiteIds: string[], ano: number | undefined, usuario: UsuarioAutenticado) {
    const ciclo = await this.ciclosService.resolver(ano);
    const todos = await this.comitesVisiveis(ciclo, usuario);
    const selecionados = comiteIds?.length
      ? todos.filter((comite) => comiteIds.includes(comite.id))
      : todos;

    const resumos = await this.resumirTodos(selecionados, ciclo);

    const consolidado = resumos.reduce(
      (acumulado, { resumo }) => ({
        participantes: acumulado.participantes + resumo.totalParticipantes,
        vlrTeorico: acumulado.vlrTeorico + resumo.pool.vlrTeoricoTotal,
        poolDisponivel: acumulado.poolDisponivel + resumo.pool.poolDisponivel,
        poolConsumido: acumulado.poolConsumido + resumo.pool.poolConsumido,
      }),
      { participantes: 0, vlrTeorico: 0, poolDisponivel: 0, poolConsumido: 0 },
    );

    return {
      ciclo: ciclo.ano,
      comitesSelecionados: selecionados.length,
      consolidado: {
        participantes: consolidado.participantes,
        vlrTeoricoTotal: paraMoeda(consolidado.vlrTeorico),
        poolDisponivel: paraMoeda(consolidado.poolDisponivel),
        poolConsumido: paraMoeda(consolidado.poolConsumido),
        saldo: paraMoeda(consolidado.poolDisponivel - consolidado.poolConsumido),
        percentualUtilizado: consolidado.poolDisponivel
          ? Number(((consolidado.poolConsumido / consolidado.poolDisponivel) * 100).toFixed(4))
          : 0,
      },
      comites: resumos.map(({ comite, resumo }) => ({
        comiteId: comite.id,
        grupoRanking: comite.grupoRanking,
        status: comite.status,
        participantes: resumo.totalParticipantes,
        analisados: resumo.analisados,
        poolDisponivel: resumo.pool.poolDisponivel,
        poolConsumido: resumo.pool.poolConsumido,
        saldo: resumo.pool.saldo,
        percentualUtilizado: resumo.pool.percentualUtilizado,
        performancePonderada: resumo.performancePonderada,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Discricionários nominais
  // ------------------------------------------------------------------

  /** Lista completa dos discricionários concedidos no ciclo. */
  async discricionariosNominais(ano: number | undefined, usuario: UsuarioAutenticado) {
    const ciclo = await this.ciclosService.resolver(ano);
    const comites = await this.comitesVisiveis(ciclo, usuario);
    if (!comites.length) return { ciclo: ciclo.ano, total: 0, itens: [] };

    const participantes = await this.participantes.find({
      where: { cicloId: ciclo.id, comiteId: In(comites.map((comite) => comite.id)) },
      relations: { acrescimos: true, comite: true },
      order: { nome: 'ASC' },
    });

    const premissas = this.resumoService.premissas(ciclo);
    const itens = participantes
      .filter((participante) => Number(participante.fd) !== 0)
      .map((participante) => {
        const elegiveis = (participante.acrescimos ?? []).filter((acrescimo) => acrescimo.elegivel);
        const calculo = this.calculoService.calcularParticipante(participante, elegiveis, premissas);

        return {
          participanteId: participante.id,
          emplid: participante.emplid,
          nome: participante.nome,
          nivel: participante.xlatlongname,
          modeloAvaliacao: participante.modeloAvaliacao,
          comiteId: participante.comiteId,
          comite: participante.comite?.grupoRanking ?? null,
          fd: calculo.fd,
          fdPp: this.calculoService.formatarPp(calculo.fd),
          motivo: participante.motivoDiscricionario,
          justificativa: participante.observacaoPoscomite,
          prSemDiscricionario: calculo.prSemDiscricionario,
          prPosDiscricionario: calculo.prPosDiscricionario,
          impacto: calculo.diferencaDiscricionario,
          foraDoLimite: participante.fdForaLimite,
          pendente: participante.pendente,
        };
      });

    return { ciclo: ciclo.ano, total: itens.length, itens };
  }

  // ------------------------------------------------------------------
  // Controle de grupos
  // ------------------------------------------------------------------

  /** Prontidão para conclusão, distribuição por nível e elegíveis sem grupo. */
  async controleDeGrupos(ano: number | undefined, usuario: UsuarioAutenticado) {
    const ciclo = await this.ciclosService.resolver(ano);
    const comites = await this.comitesVisiveis(ciclo, usuario);
    const resumos = await this.resumirTodos(comites, ciclo);

    const semComite = await this.participantes.find({
      where: { cicloId: ciclo.id, comiteId: IsNull() },
      select: { id: true, emplid: true, nome: true, xlatlongname: true, area: true, grupoRanking: true },
      take: 500,
    });

    return {
      ciclo: ciclo.ano,
      comites: resumos.map(({ comite, resumo }) => ({
        comiteId: comite.id,
        grupoRanking: comite.grupoRanking,
        status: comite.status,
        participantes: resumo.totalParticipantes,
        analisados: resumo.analisados,
        pendencias: resumo.pendencias,
        temAta: Boolean(comite.ata),
        poolExcedido: resumo.pool.excedido,
        precisaRever: resumo.precisaRever,
        prontoParaConcluir:
          resumo.pendencias === 0 &&
          Boolean(comite.ata?.data && comite.ata?.horaInicio && comite.ata?.horaFim) &&
          resumo.totalParticipantes > 0,
        distribuicaoPorNivel: resumo.porNivelCargo.map((linha) => ({
          nivel: linha.nivel,
          totalHc: linha.totalHc,
          institucional: linha.institucional,
          comunidade: linha.comunidade,
        })),
      })),
      elegiveisSemComite: {
        total: semComite.length,
        participantes: semComite,
      },
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async comitesVisiveis(ciclo: Ciclo, usuario: UsuarioAutenticado): Promise<Comite[]> {
    const qb = this.comites
      .createQueryBuilder('comite')
      .leftJoinAndSelect('comite.ata', 'ata')
      .where('comite.ciclo_id = :cicloId', { cicloId: ciclo.id });

    aplicarVisibilidadeComite(qb, 'comite', usuario);
    return qb.orderBy('comite.nome', 'ASC').getMany();
  }

  private async resumirTodos(
    comites: Comite[],
    ciclo: Ciclo,
  ): Promise<Array<{ comite: Comite; resumo: ResumoComite }>> {
    const resultados: Array<{ comite: Comite; resumo: ResumoComite }> = [];

    for (const comite of comites) {
      resultados.push({ comite, resumo: await this.resumoService.resumir(comite.id, ciclo) });
    }
    return resultados;
  }

  /** Séries dos gráficos da visão geral: por nível, por modelo e por status. */
  private async graficosGerais(resumos: Array<{ comite: Comite; resumo: ResumoComite }>) {
    const porNivel = new Map<string, { nivel: string; hc: number; comDisc: number; saldo: number }>();
    const porModelo = new Map<string, { modelo: string; hc: number; comDisc: number; saldo: number }>();

    let positivo = 0;
    let negativo = 0;

    for (const { resumo } of resumos) {
      for (const linha of resumo.porNivelCargo) {
        const atual = porNivel.get(linha.nivel) ?? { nivel: linha.nivel, hc: 0, comDisc: 0, saldo: 0 };
        atual.hc += linha.totalHc;
        atual.comDisc += linha.modelos.reduce((total, bloco) => total + bloco.hcComDiscricionario, 0);
        atual.saldo += linha.modelos.reduce((total, bloco) => total + bloco.saldo, 0);
        porNivel.set(linha.nivel, atual);
      }

      for (const bloco of resumo.porModeloAvaliacao) {
        const atual = porModelo.get(bloco.modelo) ?? {
          modelo: bloco.modelo,
          hc: 0,
          comDisc: 0,
          saldo: 0,
        };
        atual.hc += bloco.hcTotal;
        atual.comDisc += bloco.hcComDiscricionario;
        atual.saldo += bloco.saldo;
        porModelo.set(bloco.modelo, atual);

        positivo += bloco.discricionarioPositivo;
        negativo += bloco.discricionarioNegativo;
      }
    }

    return {
      porNivelCargo: [...porNivel.values()].sort((a, b) => a.nivel.localeCompare(b.nivel, 'pt-BR')),
      porModeloAvaliacao: [...porModelo.values()],
      statusDeAnalise: [
        {
          status: 'Analisados',
          total: resumos.reduce((total, { resumo }) => total + resumo.analisados, 0),
        },
        {
          status: 'Pendentes',
          total: resumos.reduce((total, { resumo }) => total + resumo.pendentesDeAnalise, 0),
        },
      ],
      discricionario: {
        positivo: paraMoeda(positivo),
        negativo: paraMoeda(negativo),
        saldo: paraMoeda(positivo + negativo),
      },
    };
  }
}
