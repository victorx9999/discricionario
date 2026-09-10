import { AcaoAuditoria, StatusAnalise, StatusComite } from '../common/enums';
import { ExcecaoDiscricionarioInvalido, ExcecaoNegocio } from '../common/filters';
import { DiscricionarioService } from './discricionario.service';
import { CalculoService } from './services/calculo.service';

const PARTICIPANTE = {
  id: 'part-1',
  funcional: '900001',
  nome: 'Ana Souza Almeida',
  valorBase: 10000,
  fbpa: 1,
  fpi: 1.2,
};

function criarAnalise(statusComite = StatusComite.EM_ANDAMENTO) {
  return {
    id: 'analise-1',
    comiteId: 'comite-1',
    participanteId: 'part-1',
    ordem: 5,
    status: StatusAnalise.PENDENTE,
    participante: PARTICIPANTE,
    comite: { id: 'comite-1', status: statusComite },
  };
}

const POOL = {
  vlrTeoricoTotal: 10_000_000,
  percentual: 0.01,
  poolTotal: 100_000,
  totalPositivo: 500,
  totalNegativo: 0,
  poolUtilizado: 500,
  poolDisponivel: 99_500,
  percentualUtilizado: 0.5,
};

function montarServico(opcoes: { existente?: Record<string, unknown> | null; analise?: unknown } = {}) {
  const analise = opcoes.analise ?? criarAnalise();
  const existente = opcoes.existente ?? null;
  const salvos: Record<string, unknown>[] = [];

  const repositorio = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.analiseId ? existente : (salvos[salvos.length - 1] ?? null),
    ),
    createQueryBuilder: jest.fn(),
  };

  const analises = {
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      where.ordem ? null : analise,
    ),
  };

  const avaliacoes = {
    findOne: jest.fn(async () => ({ id: 'aval-1', codigo: 'PERFORMANCE' })),
    find: jest.fn(async () => []),
  };

  const manager = {
    create: jest.fn((_entidade: unknown, dados: Record<string, unknown>) => dados),
    save: jest.fn(async (_entidade: unknown, dados: Record<string, unknown>) => {
      const persistido = { id: existente?.id ?? 'disc-1', atualizadoEm: new Date(), ...dados };
      salvos.push(persistido);
      return persistido;
    }),
    update: jest.fn(async () => undefined),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(manager)),
  };

  const poolService = {
    validarLancamento: jest.fn(async () => POOL),
    consolidar: jest.fn(async () => POOL),
  };

  const resumoService = {
    resumoPorNivelCargo: jest.fn(async () => [{ chave: 'Pleno', participantes: 10 }]),
    resumoPorModeloAvaliacao: jest.fn(async () => [{ chave: 'Corporativo', participantes: 10 }]),
  };

  // sem implementação tipada: permite inspecionar mock.calls[n][0]
  const auditoriaService = { registrar: jest.fn(), registrarMuitos: jest.fn() };

  const servico = new DiscricionarioService(
    repositorio as never,
    analises as never,
    avaliacoes as never,
    dataSource as never,
    new CalculoService(),
    poolService as never,
    resumoService as never,
    auditoriaService as never,
  );

  return { servico, repositorio, analises, manager, poolService, resumoService, auditoriaService };
}

const USUARIO = {
  id: 'user-1',
  email: 'ana@discricionario.local',
  nome: 'Ana',
  perfil: 'ADMIN' as never,
};

describe('DiscricionarioService', () => {
  describe('salvar — lançamento novo', () => {
    it('valida, calcula e persiste os valores derivados', async () => {
      const { servico, manager } = montarServico();

      const resposta = await servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO);

      // FPI_FINAL = 1.2 + 0.05 = 1.25 | PR_I = 12.000 | PR_F = 12.500
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          valorFd: 0.05,
          fpiFinalCalculado: 1.25,
          valorPrICalculado: 12000,
          valorPrFCalculado: 12500,
          impactoFinanceiro: 500,
        }),
      );
      expect(resposta.discricionario.valorFdPp).toBe('+5pp');
    });

    it('valida o pool antes de persistir, informando o impacto anterior zerado', async () => {
      const { servico, poolService } = montarServico();

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO);

      expect(poolService.validarLancamento).toHaveBeenCalledWith('comite-1', 0, 500);
    });

    it('marca a análise do participante como ANALISADO', async () => {
      const { servico, manager } = montarServico();

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO);

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'analise-1' },
        expect.objectContaining({ status: StatusAnalise.ANALISADO, analisadoPorId: 'user-1' }),
      );
    });

    it('registra a auditoria de criação com comitê e participante', async () => {
      const { servico, auditoriaService } = montarServico();

      await servico.salvar(
        { analiseId: 'analise-1', valorFd: -0.05, justificativa: 'Ajuste de posicionamento' },
        USUARIO,
      );

      expect(auditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: AcaoAuditoria.DISCRICIONARIO_CRIADO,
          entidade: 'DISCRICIONARIO',
          comiteId: 'comite-1',
          participanteId: 'part-1',
          campoAlterado: 'valorFd',
          valorAnterior: null,
          valorNovo: -0.05,
          justificativa: 'Ajuste de posicionamento',
        }),
      );
    });

    it('devolve pool e resumo atualizados na mesma resposta', async () => {
      const { servico, poolService, resumoService } = montarServico();

      const resposta = await servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO);

      expect(poolService.consolidar).toHaveBeenCalledWith('comite-1');
      expect(resumoService.resumoPorNivelCargo).toHaveBeenCalledWith('comite-1');
      expect(resposta.pool.poolTotal).toBe(100_000);
      expect(resposta.resumoPorNivelCargo).toHaveLength(1);
      expect(resposta.resumoPorModeloAvaliacao).toHaveLength(1);
    });

    it('não busca o próximo participante quando não solicitado', async () => {
      const { servico } = montarServico();

      const resposta = await servico.salvar({ analiseId: 'analise-1', valorFd: 0 }, USUARIO);

      expect(resposta.proximaAnalise).toBeNull();
    });

    it('aceita valor zero', async () => {
      const { servico, manager } = montarServico();

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0 }, USUARIO);

      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ valorFd: 0, impactoFinanceiro: 0, fpiFinalCalculado: 1.2 }),
      );
    });
  });

  describe('salvar — validações', () => {
    it('rejeita valor acima de +15pp', async () => {
      const { servico } = montarServico();

      await expect(servico.salvar({ analiseId: 'analise-1', valorFd: 0.2 }, USUARIO)).rejects.toThrow(
        ExcecaoDiscricionarioInvalido,
      );
    });

    it('rejeita valor abaixo de -15pp', async () => {
      const { servico } = montarServico();

      await expect(
        servico.salvar({ analiseId: 'analise-1', valorFd: -0.16 }, USUARIO),
      ).rejects.toThrow(ExcecaoDiscricionarioInvalido);
    });

    it('não persiste nada quando o valor é inválido', async () => {
      const { servico, manager } = montarServico();

      await expect(servico.salvar({ analiseId: 'analise-1', valorFd: 5 }, USUARIO)).rejects.toThrow();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([StatusComite.FINALIZADO, StatusComite.APROVADO, StatusComite.CANCELADO])(
      'bloqueia lançamento em comitê %s',
      async (status) => {
        const { servico } = montarServico({ analise: criarAnalise(status) });

        await expect(
          servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO),
        ).rejects.toThrow(ExcecaoNegocio);
      },
    );
  });

  describe('salvar — alteração de um lançamento existente', () => {
    const existente = {
      id: 'disc-1',
      analiseId: 'analise-1',
      valorFd: 0.05,
      justificativa: 'Primeira justificativa',
      avaliacaoComportamentalId: null,
      impactoFinanceiro: 500,
      criadoPorId: 'user-9',
    };

    it('desconta o impacto anterior na validação do pool', async () => {
      const { servico, poolService } = montarServico({ existente });

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.1 }, USUARIO);

      expect(poolService.validarLancamento).toHaveBeenCalledWith('comite-1', 500, 1000);
    });

    it('audita valor e justificativa em registros separados', async () => {
      const { servico, auditoriaService } = montarServico({ existente });

      await servico.salvar(
        { analiseId: 'analise-1', valorFd: 0.1, justificativa: 'Nova justificativa' },
        USUARIO,
      );

      const acoes = auditoriaService.registrar.mock.calls.map((chamada) => chamada[0].acao);
      expect(acoes).toContain(AcaoAuditoria.DISCRICIONARIO_ALTERADO);
      expect(acoes).toContain(AcaoAuditoria.JUSTIFICATIVA_ALTERADA);
    });

    it('preserva a justificativa quando o campo não é enviado', async () => {
      const { servico, manager } = montarServico({ existente });

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.1 }, USUARIO);

      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ justificativa: 'Primeira justificativa' }),
      );
    });

    it('preserva o autor original do lançamento', async () => {
      const { servico, manager } = montarServico({ existente });

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.1 }, USUARIO);

      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ criadoPorId: 'user-9', atualizadoPorId: 'user-1' }),
      );
    });

    it('não gera auditoria de valor quando o FD não mudou', async () => {
      const { servico, auditoriaService } = montarServico({ existente });

      await servico.salvar({ analiseId: 'analise-1', valorFd: 0.05 }, USUARIO);

      const acoes = auditoriaService.registrar.mock.calls.map((chamada) => chamada[0].acao);
      expect(acoes).not.toContain(AcaoAuditoria.DISCRICIONARIO_ALTERADO);
    });
  });
});
