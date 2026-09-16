import { CalculoService } from '../../calculo/calculo.service';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { ResultadoChecagem } from '../../common/enums';
import { ResumoComiteService } from './resumo.service';

/** Ciclo com as premissas vigentes da seção 10. */
function criarCiclo(sobrescreve: Partial<Ciclo> = {}): Ciclo {
  return {
    id: 'ciclo-1',
    ano: 2026,
    percentualPool: 0.01,
    limiteFd: 0.15,
    divisorHcMax: 3,
    fatorPep: 0.725,
    fatorDiferimento: 0.7,
    tipoSimuladorPerformance: 'Institucional',
    ...sobrescreve,
  } as Ciclo;
}

/**
 * Participante mínimo: o CALC4 é a BASE (o próprio VB), então o PR sai de
 * CALC4 × FPI e acompanha o FPI de forma previsível nos testes.
 */
function participante(
  emplid: string,
  nivel: string,
  modelo: string,
  fpi: number,
  fd: number,
  valorBase = 120_000,
) {
  const calc4 = valorBase;
  return {
    id: `p-${emplid}`,
    emplid,
    xlatlongname: nivel,
    modeloAvaliacao: modelo,
    fpi,
    fd,
    calc4,
    vlPrI: calc4,
    vlrTeorico: calc4,
    vlBaseMes: valorBase / 12,
    nota: 3,
    acrescimos: [],
    codMotivador: fd === 0 ? null : 1,
    observacaoPoscomite: fd === 0 ? null : 'Justificativa',
    get pendente() {
      return this.fd !== 0 && (!this.codMotivador || !this.observacaoPoscomite);
    },
  };
}

function montarServico(participantes: unknown[]) {
  const repositorio = { find: jest.fn(async () => participantes) };
  return new ResumoComiteService(repositorio as never, new CalculoService());
}

describe('ResumoComiteService', () => {
  describe('resumo por nível de cargo', () => {
    it('separa Institucional e Comunidade dentro de cada nível', async () => {
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1.1, 0.05),
        participante('2', 'Coordenador', 'Institucional', 1.1, 0),
        participante('3', 'Coordenador', 'Comunidade', 1.1, 0),
        participante('4', 'Gerente', 'Institucional', 1.15, -0.05),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());
      const coordenador = resumo.porNivelCargo.find((linha) => linha.nivel === 'Coordenador');

      expect(coordenador?.totalHc).toBe(3);
      expect(coordenador?.institucional.hcTotal).toBe(2);
      expect(coordenador?.institucional.aumento).toBe(1);
      expect(coordenador?.institucional.reducao).toBe(0);
      expect(coordenador?.comunidade.hcTotal).toBe(1);
      expect(coordenador?.comunidade.hcComDiscricionario).toBe(0);
    });

    it('HC Máx. é o teto de 1/3 do HC do nível/modelo', async () => {
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1.1, 0),
        participante('2', 'Coordenador', 'Institucional', 1.1, 0),
        participante('3', 'Coordenador', 'Institucional', 1.1, 0),
        participante('4', 'Coordenador', 'Institucional', 1.1, 0),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());
      expect(resumo.porNivelCargo[0].institucional.hcMaximo).toBe(2);
    });

    it('sinaliza REVER quando os discricionários passam de 1/3 do HC', async () => {
      const servico = montarServico([
        participante('1', 'Gerente', 'Institucional', 1.1, 0.05),
        participante('2', 'Gerente', 'Institucional', 1.1, 0.05),
        participante('3', 'Gerente', 'Institucional', 1.1, 0),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());

      // HC 3 => HC Máx 1; com 2 lançamentos, precisa rever.
      expect(resumo.porNivelCargo[0].institucional.hcMaximo).toBe(1);
      expect(resumo.porNivelCargo[0].institucional.hcComDiscricionario).toBe(2);
      expect(resumo.porNivelCargo[0].institucional.checagem).toBe(ResultadoChecagem.REVER);
      expect(resumo.precisaRever).toBe(true);
    });

    it('nível não informado é agrupado explicitamente', async () => {
      const servico = montarServico([participante('1', '', 'Institucional', 1.1, 0)]);
      const resumo = await servico.resumir('comite-1', criarCiclo());

      expect(resumo.porNivelCargo[0].nivel).toBe('Não informado');
    });
  });

  describe('contagens e pendências', () => {
    it('conta analisados, pendentes de análise e pendências', async () => {
      const comPendencia = participante('3', 'Coordenador', 'Institucional', 1.1, 0.05);
      comPendencia.observacaoPoscomite = null;

      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1.1, 0.05),
        participante('2', 'Coordenador', 'Institucional', 1.1, 0),
        comPendencia,
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());

      expect(resumo.totalParticipantes).toBe(3);
      expect(resumo.analisados).toBe(2);
      expect(resumo.pendentesDeAnalise).toBe(1);
      expect(resumo.pendencias).toBe(1);
    });
  });

  describe('pool', () => {
    it('pool disponível é 1% do Σ VLR_TEORICO do comitê', async () => {
      // 2 participantes com CALC4 = 120.000 x 1,0 => VLR_TEORICO 120.000 cada
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1, 0),
        participante('2', 'Coordenador', 'Institucional', 1, 0),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());

      expect(resumo.pool.vlrTeoricoTotal).toBe(240_000);
      expect(resumo.pool.poolDisponivel).toBe(2_400);
      expect(resumo.pool.poolConsumido).toBe(0);
      expect(resumo.pool.excedido).toBe(false);
    });

    it('consumo é a soma das diferenças de PR e negativos devolvem verba', async () => {
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1, 0.1),
        participante('2', 'Coordenador', 'Institucional', 1, -0.05),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());

      // +12.000 e −6.000 sobre CALC4 de 120.000
      expect(resumo.pool.poolConsumido).toBe(6_000);
    });

    it('marca excedido quando o consumo passa do pool', async () => {
      const servico = montarServico([participante('1', 'Coordenador', 'Institucional', 1, 0.15)]);
      const resumo = await servico.resumir('comite-1', criarCiclo());

      expect(resumo.pool.poolDisponivel).toBe(1_200);
      expect(resumo.pool.poolConsumido).toBe(18_000);
      expect(resumo.pool.excedido).toBe(true);
    });

    it('usa o percentual de pool do ciclo', async () => {
      const servico = montarServico([participante('1', 'Coordenador', 'Institucional', 1, 0)]);
      const resumo = await servico.resumir('comite-1', criarCiclo({ percentualPool: 0.02 }));

      expect(resumo.pool.poolDisponivel).toBe(2_400);
    });
  });

  describe('performance ponderada por VB', () => {
    it('calcula antes (FPI) e depois (FPI_FINAL) do discricionário', async () => {
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1.1, 0.05, 120_000),
        participante('2', 'Coordenador', 'Institucional', 1.2, 0, 120_000),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());

      // Mesmo VB: média simples de 1,10 e 1,20 = 1,15; depois 1,15 e 1,20 = 1,175
      expect(resumo.performancePonderada.antes).toBeCloseTo(1.15, 6);
      expect(resumo.performancePonderada.depois).toBeCloseTo(1.175, 6);
      expect(resumo.performancePonderada.variacao).toBeCloseTo(0.025, 6);
    });

    it('considera apenas o tipo de simulador configurado no ciclo', async () => {
      const servico = montarServico([
        participante('1', 'Coordenador', 'Institucional', 1.1, 0),
        participante('2', 'Coordenador', 'Comunidade', 2, 0),
      ]);

      const resumo = await servico.resumir('comite-1', criarCiclo());
      expect(resumo.performancePonderada.antes).toBeCloseTo(1.1, 6);
    });
  });
});
