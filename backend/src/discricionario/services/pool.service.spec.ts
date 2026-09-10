import { ExcecaoPool } from '../../common/filters';
import { CalculoService } from './calculo.service';
import { PoolService } from './pool.service';

/**
 * O `PoolService` agrega no banco; aqui o QueryBuilder é substituído por um
 * duplo que devolve os totais controlados pelo teste.
 */
function criarRepositorioFalso(totais: {
  vlrTeoricoTotal: string;
  totalPositivo: string;
  totalNegativo: string;
}) {
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(totais),
  };

  return {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    queryBuilder,
  };
}

describe('PoolService', () => {
  const calculoService = new CalculoService();

  const criarServico = (totais: {
    vlrTeoricoTotal: string;
    totalPositivo: string;
    totalNegativo: string;
  }) => {
    const repositorio = criarRepositorioFalso(totais);
    return {
      servico: new PoolService(repositorio as never, calculoService),
      repositorio,
    };
  };

  describe('consolidar', () => {
    it('devolve pool total, utilizado e disponível', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '10000000.00',
        totalPositivo: '60000.00',
        totalNegativo: '10000.00',
      });

      const pool = await servico.consolidar('comite-1');

      expect(pool.poolTotal).toBe(100_000);
      expect(pool.totalPositivo).toBe(60_000);
      expect(pool.totalNegativo).toBe(10_000);
      expect(pool.poolUtilizado).toBe(50_000);
      expect(pool.poolDisponivel).toBe(50_000);
      expect(pool.percentualUtilizado).toBe(50);
    });

    it('comitê sem participantes devolve pool zerado', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '0',
        totalPositivo: '0',
        totalNegativo: '0',
      });

      const pool = await servico.consolidar('comite-vazio');
      expect(pool.poolTotal).toBe(0);
      expect(pool.poolDisponivel).toBe(0);
    });
  });

  describe('validarLancamento', () => {
    it('permite lançamento que cabe no pool disponível', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '10000000.00',
        totalPositivo: '50000.00',
        totalNegativo: '0',
      });

      const projecao = await servico.validarLancamento('comite-1', 0, 20_000);

      expect(projecao.poolUtilizado).toBe(70_000);
      expect(projecao.poolDisponivel).toBe(30_000);
    });

    it('bloqueia lançamento que ultrapassa o pool', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '10000000.00',
        totalPositivo: '95000.00',
        totalNegativo: '0',
      });

      await expect(servico.validarLancamento('comite-1', 0, 20_000)).rejects.toThrow(ExcecaoPool);
    });

    it('desconta o impacto anterior ao revisar um lançamento existente', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '10000000.00',
        totalPositivo: '95000.00',
        totalNegativo: '0',
      });

      // Substituir 20.000 por 15.000 cabe: 95.000 - 20.000 + 15.000 = 90.000
      const projecao = await servico.validarLancamento('comite-1', 20_000, 15_000);
      expect(projecao.poolUtilizado).toBe(90_000);
    });

    it('lançamento negativo devolve saldo ao pool', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '10000000.00',
        totalPositivo: '80000.00',
        totalNegativo: '0',
      });

      const projecao = await servico.validarLancamento('comite-1', 0, -5_000);

      expect(projecao.totalNegativo).toBe(5_000);
      expect(projecao.poolUtilizado).toBe(75_000);
      expect(projecao.poolDisponivel).toBe(25_000);
    });

    it('o erro traz o excedente para exibição ao usuário', async () => {
      const { servico } = criarServico({
        vlrTeoricoTotal: '1000000.00',
        totalPositivo: '9000.00',
        totalNegativo: '0',
      });

      // Pool total = 10.000; utilizado projetado = 9.000 + 3.000 = 12.000
      await expect(servico.validarLancamento('comite-1', 0, 3_000)).rejects.toMatchObject({
        response: {
          codigo: 'POOL_EXCEDIDO',
          detalhes: { excedente: 2_000 },
        },
      });
    });
  });
});
