import { StatusAnalise } from '../../common/enums';
import { CalculoService } from './calculo.service';
import { PoolService } from './pool.service';
import { ResumoService } from './resumo.service';

describe('ResumoService', () => {
  const linhasPorNivel = [
    {
      chave: 'Júnior',
      participantes: '20',
      analisados: '18',
      positivo: '15000.00',
      negativo: '-3000.00',
      saldo: '12000.00',
      vlrTeorico: '900000.00',
    },
    {
      chave: 'Pleno',
      participantes: '30',
      analisados: '30',
      positivo: '40000.00',
      negativo: '-10000.00',
      saldo: '30000.00',
      vlrTeorico: '2100000.00',
    },
  ];

  function criarServico() {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(linhasPorNivel),
    };

    const repositorio = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      count: jest.fn(async (opcoes?: { where?: { status?: StatusAnalise } }) =>
        opcoes?.where?.status === StatusAnalise.ANALISADO ? 48 : 50,
      ),
    };

    const poolService = {
      consolidar: jest.fn().mockResolvedValue({
        vlrTeoricoTotal: 3_000_000,
        percentual: 0.01,
        poolTotal: 30_000,
        totalPositivo: 55_000,
        totalNegativo: 13_000,
        poolUtilizado: 42_000,
        poolDisponivel: -12_000,
        percentualUtilizado: 140,
      }),
    } as unknown as PoolService;

    return {
      servico: new ResumoService(repositorio as never, poolService),
      repositorio,
      poolService,
    };
  }

  it('converte as linhas agregadas em resumo por nível de cargo', async () => {
    const { servico } = criarServico();
    const linhas = await servico.resumoPorNivelCargo('comite-1');

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      chave: 'Júnior',
      participantes: 20,
      analisados: 18,
      pendentes: 2,
      discricionarioPositivo: 15000,
      discricionarioNegativo: -3000,
      saldo: 12000,
      vlrTeorico: 900000,
    });
  });

  it('o saldo é a soma algébrica de positivos e negativos', async () => {
    const { servico } = criarServico();
    const linhas = await servico.resumoPorNivelCargo('comite-1');

    linhas.forEach((linha) => {
      expect(linha.saldo).toBe(linha.discricionarioPositivo + linha.discricionarioNegativo);
    });
  });

  it('o resumo completo combina pool, contagens e agrupamentos', async () => {
    const { servico, poolService } = criarServico();
    const resumo = await servico.resumoComite('comite-1');

    expect(poolService.consolidar).toHaveBeenCalledWith('comite-1', undefined);
    expect(resumo.totalParticipantes).toBe(50);
    expect(resumo.participantesAnalisados).toBe(48);
    expect(resumo.participantesPendentes).toBe(2);
    expect(resumo.pool.poolTotal).toBe(30_000);
    expect(resumo.porNivelCargo).toHaveLength(2);
    expect(resumo.porModeloAvaliacao).toHaveLength(2);
  });
});
