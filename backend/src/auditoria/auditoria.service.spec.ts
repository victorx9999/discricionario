import { AcaoAuditoria, OrigemAuditoria } from '../common/enums';
import { AuditoriaService } from './auditoria.service';

describe('AuditoriaService', () => {
  function criarServico() {
    const repositorio = {
      create: jest.fn((dados) => dados),
      save: jest.fn(async (dados) => ({ id: 'log-1', ...dados })),
      // sem implementação tipada: permite inspecionar mock.calls[0][0]
      insert: jest.fn(),
      find: jest.fn(async () => []),
      findAndCount: jest.fn(async () => [[], 0]),
    };

    return { servico: new AuditoriaService(repositorio as never), repositorio };
  }

  it('registra a ação com usuário, entidade e origem backend', async () => {
    const { servico, repositorio } = criarServico();

    await servico.registrar({
      acao: AcaoAuditoria.DISCRICIONARIO_ALTERADO,
      entidade: 'DISCRICIONARIO',
      entidadeId: 'disc-1',
      usuario: { id: 'user-1', email: 'ana@discricionario.local' },
      comiteId: 'comite-1',
      participanteId: 'part-1',
      campoAlterado: 'valorFd',
      valorAnterior: 0.05,
      valorNovo: 0.08,
      justificativa: 'Ajuste aprovado em comitê',
    });

    expect(repositorio.save).toHaveBeenCalledTimes(1);
    expect(repositorio.create).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: AcaoAuditoria.DISCRICIONARIO_ALTERADO,
        entidade: 'DISCRICIONARIO',
        entidadeId: 'disc-1',
        usuarioId: 'user-1',
        usuarioEmail: 'ana@discricionario.local',
        comiteId: 'comite-1',
        participanteId: 'part-1',
        campoAlterado: 'valorFd',
        valorAnterior: '0.05',
        valorNovo: '0.08',
        justificativa: 'Ajuste aprovado em comitê',
        origem: OrigemAuditoria.BACKEND,
      }),
    );
  });

  it('serializa objetos em JSON no valor auditado', async () => {
    const { servico, repositorio } = criarServico();

    await servico.registrar({
      acao: AcaoAuditoria.GRUPO_ALTERADO,
      entidade: 'GRUPO',
      valorNovo: { nome: 'Grupo A' },
    });

    expect(repositorio.create).toHaveBeenCalledWith(
      expect.objectContaining({ valorNovo: '{"nome":"Grupo A"}' }),
    );
  });

  it('uma falha ao auditar não derruba a operação de negócio', async () => {
    const { servico, repositorio } = criarServico();
    repositorio.save.mockRejectedValueOnce(new Error('banco indisponível'));

    await expect(
      servico.registrar({ acao: AcaoAuditoria.LOGIN, entidade: 'USUARIO' }),
    ).resolves.toBeNull();
  });

  describe('registrarAlteracoes', () => {
    it('gera um registro por campo efetivamente alterado', async () => {
      const { servico, repositorio } = criarServico();

      await servico.registrarAlteracoes(
        { acao: AcaoAuditoria.GRUPO_ALTERADO, entidade: 'GRUPO', entidadeId: 'grupo-1' },
        { nome: 'Antigo', status: 'ATIVO', descricao: null },
        { nome: 'Novo', status: 'ATIVO', descricao: 'Descrição nova' },
        ['nome', 'status', 'descricao'],
      );

      const registros = repositorio.insert.mock.calls[0][0];
      expect(registros).toHaveLength(2);
      expect(registros.map((registro: { campoAlterado: string }) => registro.campoAlterado)).toEqual([
        'nome',
        'descricao',
      ]);
    });

    it('não registra nada quando nenhum campo mudou', async () => {
      const { servico, repositorio } = criarServico();

      await servico.registrarAlteracoes(
        { acao: AcaoAuditoria.COMITE_ALTERADO, entidade: 'COMITE' },
        { nome: 'Comitê', status: 'EM_ANDAMENTO' },
        { nome: 'Comitê', status: 'EM_ANDAMENTO' },
        ['nome', 'status'],
      );

      expect(repositorio.insert).not.toHaveBeenCalled();
    });

    it('trata null, undefined e string vazia como equivalentes', async () => {
      const { servico, repositorio } = criarServico();

      await servico.registrarAlteracoes(
        { acao: AcaoAuditoria.GRUPO_ALTERADO, entidade: 'GRUPO' },
        { descricao: null },
        { descricao: '' },
        ['descricao'],
      );

      expect(repositorio.insert).not.toHaveBeenCalled();
    });
  });
});
