import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { aplicarVisibilidadeComite, podeAcessarComite } from '../auth/visibilidade';
import { CiclosService } from '../ciclos/ciclos.service';
import { Ciclo } from '../ciclos/entities/ciclo.entity';
import { ResultadoPaginado, aplicarFiltros } from '../common/dto';
import {
  AcaoAuditoria,
  ModeloAvaliacao,
  OperacaoAuditoria,
  PapelResponsavel,
  StatusComite,
  TipoComite,
} from '../common/enums';
import { ExcecaoNegocio } from '../common/filters';
import { resolverDirecao, resolverOrdenacao } from '../common/utils';
import { Participante } from '../participantes/entities/participante.entity';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { AtualizarComiteDto, ConcluirComiteDto, CriarComiteDto, ListarComitesQueryDto } from './dto';
import { Comite } from './entities/comite.entity';
import { ComiteResponsavel } from './entities/comite-responsavel.entity';
import { ResumoComiteService } from './services/resumo.service';

const CAMPOS_ORDENACAO: Record<string, string> = {
  nome: 'comite.nome',
  codigo: 'comite.codigo',
  grupoRanking: 'comite.grupoRanking',
  area: 'comite.area',
  status: 'comite.status',
  tipo: 'comite.tipo',
  criadoEm: 'comite.criadoEm',
  atualizadoEm: 'comite.atualizadoEm',
};

const CAMPOS_AUDITADOS = ['nome', 'area', 'tipo', 'descricao', 'exibirGraficos'];

@Injectable()
export class ComitesService {
  constructor(
    @InjectRepository(Comite) private readonly repositorio: Repository<Comite>,
    @InjectRepository(ComiteResponsavel)
    private readonly responsaveis: Repository<ComiteResponsavel>,
    @InjectRepository(Participante) private readonly participantes: Repository<Participante>,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly dataSource: DataSource,
    private readonly ciclosService: CiclosService,
    private readonly resumoService: ResumoComiteService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listar(
    query: ListarComitesQueryDto,
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoPaginado<Comite>> {
    const ciclo = await this.ciclosService.resolver(query.ciclo);

    const qb = this.repositorio
      .createQueryBuilder('comite')
      .leftJoinAndSelect('comite.responsaveis', 'responsavel')
      .leftJoinAndSelect('responsavel.usuario', 'usuarioResponsavel')
      .leftJoinAndSelect('comite.ata', 'ata')
      .leftJoin('comite.criadoPor', 'criadoPor')
      .addSelect(['criadoPor.id', 'criadoPor.nome', 'criadoPor.email'])
      .loadRelationCountAndMap('comite.totalParticipantes', 'comite.participantes')
      .where('comite.ciclo_id = :cicloId', { cicloId: ciclo.id });

    if (query.withDeleted) qb.withDeleted();

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('comite.nome ILIKE :busca', { busca })
            .orWhere('comite.codigo ILIKE :busca', { busca })
            .orWhere('comite.grupo_ranking ILIKE :busca', { busca });
        }),
      );
    }
    if (query.status) qb.andWhere('comite.status = :status', { status: query.status });
    if (query.tipo) qb.andWhere('comite.tipo = :tipo', { tipo: query.tipo });
    if (query.area) qb.andWhere('comite.area = :area', { area: query.area });
    if (query.semAta) qb.andWhere('ata.id IS NULL');
    if (query.responsavelId) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM comite_responsaveis cr
                 WHERE cr.comite_id = comite.id AND cr.usuario_id = :responsavelId)`,
        { responsavelId: query.responsavelId },
      );
    }

    aplicarFiltros(qb, query.filtros, CAMPOS_ORDENACAO);
    aplicarVisibilidadeComite(qb, 'comite', usuario);

    qb.orderBy(resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO, 'nome'), resolverDirecao(query.order))
      .skip(query.skip)
      .take(query.take);

    return ResultadoPaginado.de(await qb.getManyAndCount(), query);
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<Comite> {
    const comite = await this.repositorio
      .createQueryBuilder('comite')
      .leftJoinAndSelect('comite.responsaveis', 'responsavel')
      .leftJoinAndSelect('responsavel.usuario', 'usuarioResponsavel')
      .leftJoinAndSelect('comite.ata', 'ata')
      .leftJoinAndSelect('ata.participantes', 'ataParticipante')
      .leftJoinAndSelect('comite.ciclo', 'ciclo')
      .leftJoin('comite.criadoPor', 'criadoPor')
      .addSelect(['criadoPor.id', 'criadoPor.nome', 'criadoPor.email'])
      .loadRelationCountAndMap('comite.totalParticipantes', 'comite.participantes')
      .where('comite.id = :id', { id })
      .withDeleted()
      .getOne();

    if (!comite) {
      throw new NotFoundException(`Comitê ${id} não encontrado`);
    }
    if (!podeAcessarComite(usuario, comite)) {
      // Mesma resposta de inexistente: não revela comitês de outras equipes.
      throw new NotFoundException(`Comitê ${id} não encontrado`);
    }
    return comite;
  }

  /** Resumo completo: HC por nível/modelo, performance ponderada e pool. */
  async resumo(id: string, usuario: UsuarioAutenticado) {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    return this.resumoService.resumir(comite.id, ciclo);
  }

  async pool(id: string, usuario: UsuarioAutenticado) {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    return this.resumoService.pool(comite.id, ciclo);
  }

  /** O que ainda impede a conclusão (seção 3.7). */
  async pendencias(id: string, usuario: UsuarioAutenticado) {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    return this.levantarPendencias(comite, ciclo);
  }

  // ------------------------------------------------------------------
  // Comandos
  // ------------------------------------------------------------------

  async criar(
    dto: CriarComiteDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    const ciclo = await this.ciclosService.resolverParaEscrita(dto.ciclo);

    if (await this.repositorio.countBy({ cicloId: ciclo.id, codigo: dto.codigo })) {
      throw new ConflictException(
        `Já existe um comitê com o código ${dto.codigo} no ciclo ${ciclo.ano}`,
      );
    }

    await this.validarUsuarios([...(dto.consultoriaIds ?? []), ...(dto.backupIds ?? [])]);

    const comiteSalvo = await this.dataSource.transaction(async (manager) => {
      const comite = await manager.save(
        manager.create(Comite, {
          cicloId: ciclo.id,
          codigo: dto.codigo,
          nome: dto.nome,
          grupoRanking: `${dto.codigo} - ${dto.nome}`,
          area: dto.area ?? null,
          // Provisório: recalculado logo abaixo a partir do MODELO_AVALIACAO
          // dos participantes vinculados — nunca é escolhido manualmente.
          tipo: TipoComite.MISTO,
          descricao: dto.descricao ?? null,
          exibirGraficos: dto.exibirGraficos ?? true,
          status: StatusComite.EM_ANDAMENTO,
          criadoPorId: usuario.id,
        }),
      );

      await manager.insert(
        ComiteResponsavel,
        this.montarResponsaveis(comite.id, dto.consultoriaIds, dto.backupIds, usuario.id),
      );

      if (dto.participanteIds?.length) {
        await this.vincular(manager, comite, ciclo, dto.participanteIds);
        comite.tipo = await this.calcularTipo(comite.id, manager);
        await manager.save(Comite, comite);
      }

      return comite;
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_CRIADO,
      operacao: OperacaoAuditoria.INSERT,
      entidade: 'COMITE',
      entidadeId: comiteSalvo.id,
      cicloId: ciclo.id,
      comiteId: comiteSalvo.id,
      usuario,
      detalhes: {
        ciclo: ciclo.ano,
        codigo: dto.codigo,
        nome: dto.nome,
        consultorias: dto.consultoriaIds ?? [],
        backups: dto.backupIds ?? [],
        participantes: dto.participanteIds?.length ?? 0,
      },
      contexto,
    });

    return this.buscarPorId(comiteSalvo.id, usuario);
  }

  async atualizar(
    id: string,
    dto: AtualizarComiteDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);
    this.garantirEditavel(comite);

    const anterior = {
      nome: comite.nome,
      area: comite.area,
      tipo: comite.tipo,
      descricao: comite.descricao,
      exibirGraficos: comite.exibirGraficos,
    };

    await this.dataSource.transaction(async (manager) => {
      if (dto.nome !== undefined) {
        comite.nome = dto.nome;
        comite.grupoRanking = `${comite.codigo} - ${dto.nome}`;
      }
      if (dto.area !== undefined) comite.area = dto.area;
      if (dto.descricao !== undefined) comite.descricao = dto.descricao;
      if (dto.exibirGraficos !== undefined) comite.exibirGraficos = dto.exibirGraficos;

      await manager.save(Comite, comite);

      if (dto.consultoriaIds !== undefined || dto.backupIds !== undefined) {
        await this.validarUsuarios([...(dto.consultoriaIds ?? []), ...(dto.backupIds ?? [])]);
        await manager.delete(ComiteResponsavel, {
          comiteId: id,
          papel: In([PapelResponsavel.CONSULTORIA, PapelResponsavel.BACKUP]),
        });
        const novos = this.montarResponsaveis(id, dto.consultoriaIds, dto.backupIds, null);
        if (novos.length) await manager.insert(ComiteResponsavel, novos);
      }

      if (dto.participanteIds !== undefined) {
        await this.substituirParticipantes(manager, comite, ciclo, dto.participanteIds);
        comite.tipo = await this.calcularTipo(id, manager);
        await manager.save(Comite, comite);
      }
    });

    await this.auditoriaService.registrarAlteracoes(
      {
        acao: AcaoAuditoria.COMITE_ALTERADO,
        operacao: OperacaoAuditoria.UPDATE,
        entidade: 'COMITE',
        entidadeId: id,
        cicloId: comite.cicloId,
        comiteId: id,
        usuario,
        contexto,
      },
      anterior,
      {
        nome: comite.nome,
        area: comite.area,
        tipo: comite.tipo,
        descricao: comite.descricao,
        exibirGraficos: comite.exibirGraficos,
      },
      CAMPOS_AUDITADOS,
    );

    return this.buscarPorId(id, usuario);
  }

  /**
   * Conclui o comitê.
   *
   * Bloqueia se faltar ATA completa ou se houver discricionário sem motivador
   * ou justificativa. Com o pool estourado — possível apenas quando a premissa
   * do ciclo permite lançar acima do pool — exige confirmação explícita.
   */
  async concluir(
    id: string,
    dto: ConcluirComiteDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);

    if (comite.status === StatusComite.CONCLUIDO) {
      throw new ExcecaoNegocio('O comitê já está concluído', 'COMITE_JA_CONCLUIDO');
    }

    const pendencias = await this.levantarPendencias(comite, ciclo);

    if (pendencias.bloqueiam.length) {
      throw new ExcecaoNegocio(
        `Não é possível concluir o comitê: ${pendencias.bloqueiam.join('; ')}`,
        'COMITE_COM_PENDENCIAS',
        pendencias as unknown as Record<string, unknown>,
      );
    }

    if (pendencias.poolExcedido && !dto.confirmarPoolExcedido) {
      throw new ExcecaoNegocio(
        'O pool do comitê está excedido. Reenvie com "confirmarPoolExcedido": true para concluir mesmo assim.',
        'POOL_EXCEDIDO_NAO_CONFIRMADO',
        { pool: pendencias.pool, exigeConfirmacao: true },
      );
    }

    comite.status = StatusComite.CONCLUIDO;
    comite.concluidoEm = new Date();
    comite.concluidoPorId = usuario.id;
    comite.concluidoComPoolExcedido = pendencias.poolExcedido;
    await this.repositorio.save(comite);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_CONCLUIDO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: id,
      cicloId: comite.cicloId,
      comiteId: id,
      usuario,
      campoAlterado: 'status',
      valorAnterior: StatusComite.EM_ANDAMENTO,
      valorNovo: StatusComite.CONCLUIDO,
      detalhes: { poolExcedido: pendencias.poolExcedido, pool: pendencias.pool },
      contexto,
    });

    return this.buscarPorId(id, usuario);
  }

  async reabrir(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Comite> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);

    if (comite.status !== StatusComite.CONCLUIDO) {
      throw new ExcecaoNegocio('O comitê não está concluído', 'COMITE_NAO_CONCLUIDO');
    }

    comite.status = StatusComite.EM_ANDAMENTO;
    comite.concluidoEm = null;
    comite.concluidoPorId = null;
    await this.repositorio.save(comite);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_REABERTO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: id,
      cicloId: comite.cicloId,
      comiteId: id,
      usuario,
      campoAlterado: 'status',
      valorAnterior: StatusComite.CONCLUIDO,
      valorNovo: StatusComite.EM_ANDAMENTO,
      contexto,
    });

    return this.buscarPorId(id, usuario);
  }

  /** Remoção lógica: libera os participantes e preserva o histórico. */
  async remover(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<void> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Participante, { comiteId: id }, { comiteId: null });
      await manager.softDelete(Comite, { id });
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_REMOVIDO,
      operacao: OperacaoAuditoria.SOFT_DELETE,
      entidade: 'COMITE',
      entidadeId: id,
      cicloId: comite.cicloId,
      comiteId: id,
      usuario,
      detalhes: { codigo: comite.codigo, nome: comite.nome },
      contexto,
    });
  }

  async restaurar(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Comite> {
    await this.repositorio.restore({ id });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_RESTAURADO,
      operacao: OperacaoAuditoria.RESTORE,
      entidade: 'COMITE',
      entidadeId: id,
      comiteId: id,
      usuario,
      contexto,
    });

    return this.buscarPorId(id, usuario);
  }

  // ------------------------------------------------------------------
  // Participantes do comitê
  // ------------------------------------------------------------------

  async adicionarParticipantes(
    id: string,
    participanteIds: string[],
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<{ vinculados: number; totalNoComite: number }> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);
    this.garantirEditavel(comite);

    const vinculados = await this.dataSource.transaction(async (manager) => {
      const quantidade = await this.vincular(manager, comite, ciclo, participanteIds);
      const tipo = await this.calcularTipo(id, manager);
      await manager.update(Comite, id, { tipo });
      return quantidade;
    });

    const total = await this.participantes.count({ where: { comiteId: id } });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.PARTICIPANTE_VINCULADO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: id,
      cicloId: comite.cicloId,
      comiteId: id,
      usuario,
      detalhes: { participanteIds, vinculados },
      contexto,
    });

    return { vinculados, totalNoComite: total };
  }

  /**
   * Desvincula participantes. Remover alguém libera o registro e zera o
   * discricionário (seção 6.2).
   */
  async removerParticipantes(
    id: string,
    participanteIds: string[],
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<{ desvinculados: number; totalNoComite: number }> {
    const comite = await this.buscarPorId(id, usuario);
    const ciclo = comite.ciclo ?? (await this.ciclosService.buscarPorId(comite.cicloId));
    this.ciclosService.garantirAberto(ciclo);
    this.garantirEditavel(comite);

    const resultado = await this.participantes.update(
      { comiteId: id, id: In(participanteIds) },
      {
        comiteId: null,
        fd: 0,
        fdForaLimite: false,
        notaDiscricionario: null,
        motivoId: null,
        codMotivador: null,
        motivoDiscricionario: null,
        observacaoPoscomite: null,
        lancadoPorId: null,
        lancadoEm: null,
      },
    );

    const tipo = await this.calcularTipo(id);
    await this.repositorio.update(id, { tipo });

    const total = await this.participantes.count({ where: { comiteId: id } });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.PARTICIPANTE_DESVINCULADO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: id,
      cicloId: comite.cicloId,
      comiteId: id,
      usuario,
      detalhes: {
        participanteIds,
        desvinculados: resultado.affected ?? 0,
        observacao: 'O discricionário dos participantes removidos foi zerado.',
      },
      contexto,
    });

    return { desvinculados: resultado.affected ?? 0, totalNoComite: total };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private garantirEditavel(comite: Comite): void {
    if (comite.status === StatusComite.CONCLUIDO) {
      throw new ExcecaoNegocio(
        'Comitê concluído — avaliação, pool e ATA estão bloqueados. Reabra o comitê para editar.',
        'COMITE_CONCLUIDO',
        { comiteId: comite.id },
      );
    }
  }

  /**
   * O tipo do comitê nunca é escolhido manualmente: é sempre a composição de
   * MODELO_AVALIACAO dos participantes vinculados no momento (seção 3.2).
   * Sem participantes ainda, fica MISTO como neutro até alguém entrar.
   */
  private async calcularTipo(comiteId: string, manager?: EntityManager): Promise<TipoComite> {
    const repositorio = manager ? manager.getRepository(Participante) : this.participantes;

    const modelos = await repositorio
      .createQueryBuilder('participante')
      .select('DISTINCT participante.modeloAvaliacao', 'modeloAvaliacao')
      .where('participante.comiteId = :comiteId', { comiteId })
      .getRawMany<{ modeloAvaliacao: string | null }>();

    const temInstitucional = modelos.some((m) => m.modeloAvaliacao === ModeloAvaliacao.INSTITUCIONAL);
    const temComunidade = modelos.some((m) => m.modeloAvaliacao === ModeloAvaliacao.COMUNIDADE);

    if (temInstitucional && temComunidade) return TipoComite.MISTO;
    if (temComunidade) return TipoComite.COMUNIDADE;
    if (temInstitucional) return TipoComite.INSTITUCIONAL;
    return TipoComite.MISTO;
  }

  private montarResponsaveis(
    comiteId: string,
    consultoriaIds: string[] | undefined,
    backupIds: string[] | undefined,
    criadorId: string | null,
  ): Array<Partial<ComiteResponsavel>> {
    const responsaveis: Array<Partial<ComiteResponsavel>> = [];

    (consultoriaIds ?? []).forEach((usuarioId) =>
      responsaveis.push({ comiteId, usuarioId, papel: PapelResponsavel.CONSULTORIA }),
    );
    (backupIds ?? []).forEach((usuarioId) =>
      responsaveis.push({ comiteId, usuarioId, papel: PapelResponsavel.BACKUP }),
    );
    if (criadorId) {
      responsaveis.push({ comiteId, usuarioId: criadorId, papel: PapelResponsavel.CRIADOR });
    }

    return responsaveis;
  }

  private async validarUsuarios(ids: string[]): Promise<void> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return;

    const encontrados = await this.usuarios.count({ where: { id: In(unicos) } });
    if (encontrados !== unicos.length) {
      throw new NotFoundException('Há usuários informados que não existem');
    }
  }

  /**
   * Vincula participantes ao comitê.
   *
   * Um colaborador pertence a apenas um comitê: ao tentar vincular alguém já
   * alocado, a operação é bloqueada informando em qual comitê ele está
   * (seção 3.1).
   */
  private async vincular(
    manager: EntityManager,
    comite: Comite,
    ciclo: Ciclo,
    participanteIds: string[],
  ): Promise<number> {
    const participantes = await manager.find(Participante, {
      where: { id: In(participanteIds) },
      relations: { comite: true },
    });

    if (participantes.length !== new Set(participanteIds).size) {
      throw new NotFoundException('Há participantes informados que não existem');
    }

    const deOutroCiclo = participantes.filter((participante) => participante.cicloId !== ciclo.id);
    if (deOutroCiclo.length) {
      throw new ExcecaoNegocio(
        `Há participantes de outro ciclo na seleção: ${deOutroCiclo
          .map((p) => p.emplid)
          .slice(0, 5)
          .join(', ')}`,
        'PARTICIPANTE_DE_OUTRO_CICLO',
        { ciclo: ciclo.ano },
      );
    }

    const jaAlocados = participantes.filter(
      (participante) => participante.comiteId && participante.comiteId !== comite.id,
    );
    if (jaAlocados.length) {
      throw new ExcecaoNegocio(
        `Colaborador já alocado em outro comitê: ${jaAlocados
          .map((p) => `${p.nome} (${p.emplid}) está em ${p.comite?.grupoRanking ?? p.comiteId}`)
          .slice(0, 5)
          .join('; ')}`,
        'PARTICIPANTE_JA_ALOCADO',
        {
          participantes: jaAlocados.map((p) => ({
            id: p.id,
            emplid: p.emplid,
            nome: p.nome,
            comiteId: p.comiteId,
            comite: p.comite?.grupoRanking ?? null,
          })),
        },
      );
    }

    const novos = participantes.filter((participante) => participante.comiteId !== comite.id);
    if (!novos.length) return 0;

    await manager.update(
      Participante,
      { id: In(novos.map((participante) => participante.id)) },
      { comiteId: comite.id },
    );

    return novos.length;
  }

  /** Substitui a seleção completa de participantes do comitê. */
  private async substituirParticipantes(
    manager: EntityManager,
    comite: Comite,
    ciclo: Ciclo,
    participanteIds: string[],
  ): Promise<void> {
    const atuais = await manager.find(Participante, { where: { comiteId: comite.id } });

    const manter = new Set(participanteIds);
    const remover = atuais.filter((participante) => !manter.has(participante.id));

    if (remover.length) {
      await manager.update(
        Participante,
        { id: In(remover.map((participante) => participante.id)) },
        {
          comiteId: null,
          fd: 0,
          fdForaLimite: false,
          notaDiscricionario: null,
          motivoId: null,
          codMotivador: null,
          motivoDiscricionario: null,
          observacaoPoscomite: null,
          lancadoPorId: null,
          lancadoEm: null,
        },
      );
    }

    if (participanteIds.length) {
      await this.vincular(manager, comite, ciclo, participanteIds);
    }
  }

  /** Levanta tudo que impede (ou apenas alerta sobre) a conclusão. */
  private async levantarPendencias(comite: Comite, ciclo: Ciclo) {
    const [participantes, resumo] = await Promise.all([
      this.participantes.find({ where: { comiteId: comite.id } }),
      this.resumoService.resumir(comite.id, ciclo),
    ]);

    const semMotivoOuJustificativa = participantes.filter((participante) => participante.pendente);

    const bloqueiam: string[] = [];
    const alertam: string[] = [];

    if (!participantes.length) {
      bloqueiam.push('o comitê não possui participantes');
    }

    if (ciclo.ataObrigatoria) {
      const ata = comite.ata;
      const faltando: string[] = [];
      if (!ata) {
        faltando.push('ATA não cadastrada');
      } else {
        if (!ata.data) faltando.push('data');
        if (!ata.horaInicio) faltando.push('horário de início');
        if (!ata.horaFim) faltando.push('horário de fim');
        if (!ata.participantes?.length) faltando.push('ao menos um participante');
      }
      if (faltando.length) {
        bloqueiam.push(`ATA incompleta (${faltando.join(', ')})`);
      }
    }

    if (semMotivoOuJustificativa.length) {
      bloqueiam.push(
        `${semMotivoOuJustificativa.length} discricionário(s) sem motivador ou justificativa`,
      );
    }

    if (resumo.precisaRever) {
      alertam.push('há níveis com quantidade de discricionários acima de 1/3 do HC (Rever)');
    }
    if (resumo.pool.excedido) {
      alertam.push('o pool do comitê está excedido');
    }

    return {
      comiteId: comite.id,
      bloqueiam,
      alertam,
      poolExcedido: resumo.pool.excedido,
      pool: resumo.pool,
      participantesPendentes: semMotivoOuJustificativa.map((participante) => ({
        id: participante.id,
        emplid: participante.emplid,
        nome: participante.nome,
        fd: Number(participante.fd),
        faltaMotivador: !participante.codMotivador,
        faltaJustificativa: !participante.observacaoPoscomite?.trim(),
      })),
      podeConcluir: bloqueiam.length === 0,
    };
  }
}
