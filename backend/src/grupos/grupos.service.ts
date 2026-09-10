import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, PapelResponsavel, StatusGrupo } from '../common/enums';
import { ExcecaoNegocio } from '../common/filters';
import { resolverDirecao, resolverOrdenacao } from '../common/utils';
import { Comite } from '../comites/entities/comite.entity';
import { CalculoService } from '../discricionario/services/calculo.service';
import { ListarParticipantesQueryDto } from '../participantes/dto';
import { ParticipantesService } from '../participantes/participantes.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AtualizarGrupoDto, CriarGrupoDto, ListarGruposQueryDto } from './dto';
import { GrupoResponsavel } from './entities/grupo-responsavel.entity';
import { Grupo } from './entities/grupo.entity';

const CAMPOS_ORDENACAO = {
  nome: 'grupo.nome',
  codigo: 'grupo.codigo',
  status: 'grupo.status',
  criadoEm: 'grupo.criadoEm',
  atualizadoEm: 'grupo.atualizadoEm',
};

const CAMPOS_AUDITADOS = ['nome', 'status', 'descricao'];

@Injectable()
export class GruposService {
  constructor(
    @InjectRepository(Grupo)
    private readonly repositorio: Repository<Grupo>,
    @InjectRepository(GrupoResponsavel)
    private readonly responsaveis: Repository<GrupoResponsavel>,
    @InjectRepository(Comite)
    private readonly comites: Repository<Comite>,
    private readonly dataSource: DataSource,
    private readonly usuariosService: UsuariosService,
    private readonly participantesService: ParticipantesService,
    private readonly calculoService: CalculoService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listar(query: ListarGruposQueryDto): Promise<ResultadoPaginado<Grupo & { totalParticipantes: number }>> {
    const qb = this.repositorio
      .createQueryBuilder('grupo')
      .leftJoinAndSelect('grupo.responsaveis', 'responsavel')
      .leftJoinAndSelect('responsavel.usuario', 'usuarioResponsavel')
      .leftJoin('grupo.criadoPor', 'criadoPor')
      .addSelect(['criadoPor.id', 'criadoPor.nome', 'criadoPor.email'])
      .loadRelationCountAndMap('grupo.totalParticipantes', 'grupo.participantes');

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('grupo.nome ILIKE :busca', { busca }).orWhere('grupo.codigo ILIKE :busca', { busca });
        }),
      );
    }
    if (query.status) qb.andWhere('grupo.status = :status', { status: query.status });
    if (query.responsavelId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM grupo_responsaveis gr
          WHERE gr.grupo_id = grupo.id AND gr.usuario_id = :responsavelId
        )`,
        { responsavelId: query.responsavelId },
      );
    }

    qb.orderBy(resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO, 'nome'), resolverDirecao(query.sortOrder))
      .skip(query.skip)
      .take(query.take);

    const resultado = await qb.getManyAndCount();
    return ResultadoPaginado.de(resultado as never, query);
  }

  async buscarPorId(id: string): Promise<Grupo> {
    const grupo = await this.repositorio
      .createQueryBuilder('grupo')
      .leftJoinAndSelect('grupo.responsaveis', 'responsavel')
      .leftJoinAndSelect('responsavel.usuario', 'usuarioResponsavel')
      .leftJoin('grupo.criadoPor', 'criadoPor')
      .addSelect(['criadoPor.id', 'criadoPor.nome', 'criadoPor.email'])
      .loadRelationCountAndMap('grupo.totalParticipantes', 'grupo.participantes')
      .where('grupo.id = :id', { id })
      .getOne();

    if (!grupo) {
      throw new NotFoundException(`Grupo ${id} não encontrado`);
    }
    return grupo;
  }

  /** Participantes do grupo — mesma tabela paginada/filtrável da tela de seleção. */
  listarParticipantes(grupoId: string, query: ListarParticipantesQueryDto) {
    // O DTO expõe `skip`/`take` como getters do protótipo: espalhar o objeto
    // (`{ ...query }`) os perderia, então o filtro é aplicado na própria instância.
    query.grupoId = grupoId;
    return this.participantesService.listar(query);
  }

  /**
   * Pool do grupo: 1% do VLRTEORICO total dos participantes vinculados.
   * O VLRTEORICO considerado é o da área atual — acréscimos não entram aqui.
   */
  async calcularPool(grupoId: string) {
    await this.garantirExistencia(grupoId);

    const linha = await this.repositorio
      .createQueryBuilder('grupo')
      .innerJoin('grupo.participantes', 'participante')
      .select('COALESCE(SUM(participante.vlr_teorico), 0)', 'total')
      .where('grupo.id = :grupoId', { grupoId })
      .getRawOne<{ total: string }>();

    // Grupo sem participantes: a agregação pode não devolver linha alguma.
    return this.calculoService.consolidarPool(linha?.total ?? 0, []);
  }

  // ------------------------------------------------------------------
  // Comandos
  // ------------------------------------------------------------------

  async criar(dto: CriarGrupoDto, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Grupo> {
    if (await this.repositorio.countBy({ codigo: dto.codigo })) {
      throw new ConflictException(`Já existe um grupo com o código ${dto.codigo}`);
    }

    const participantes = await this.participantesService.validarIds(dto.participanteIds ?? []);
    const responsaveis = await this.montarResponsaveis(dto.consultoraIds, dto.backupIds, usuario);

    const grupoSalvo = await this.dataSource.transaction(async (manager) => {
      const grupo = manager.create(Grupo, {
        nome: dto.nome,
        codigo: dto.codigo,
        status: dto.status ?? StatusGrupo.ATIVO,
        descricao: dto.descricao ?? null,
        criadoPorId: usuario.id,
        participantes,
        responsaveis,
      });
      return manager.save(grupo);
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.GRUPO_CRIADO,
      entidade: 'GRUPO',
      entidadeId: grupoSalvo.id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: {
        nome: dto.nome,
        codigo: dto.codigo,
        totalParticipantes: participantes.length,
        consultoras: dto.consultoraIds ?? [],
        backups: dto.backupIds ?? [],
      },
      contexto,
    });

    return this.buscarPorId(grupoSalvo.id);
  }

  async atualizar(
    id: string,
    dto: AtualizarGrupoDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Grupo> {
    const grupo = await this.buscarPorId(id);
    const anterior = { nome: grupo.nome, status: grupo.status, descricao: grupo.descricao };

    await this.dataSource.transaction(async (manager) => {
      if (dto.nome !== undefined) grupo.nome = dto.nome;
      if (dto.status !== undefined) grupo.status = dto.status;
      if (dto.descricao !== undefined) grupo.descricao = dto.descricao;

      if (dto.consultoraIds !== undefined || dto.backupIds !== undefined) {
        await manager.delete(GrupoResponsavel, {
          grupoId: id,
          papel: In([PapelResponsavel.CONSULTORA, PapelResponsavel.BACKUP]),
        });
        const novos = await this.montarResponsaveis(dto.consultoraIds, dto.backupIds, null);
        grupo.responsaveis = novos.map((responsavel) => manager.create(GrupoResponsavel, { ...responsavel, grupoId: id }));
      }

      if (dto.participanteIds !== undefined) {
        grupo.participantes = await this.participantesService.validarIds(dto.participanteIds);
      }

      await manager.save(grupo);
    });

    await this.auditoriaService.registrarAlteracoes(
      {
        acao: AcaoAuditoria.GRUPO_ALTERADO,
        entidade: 'GRUPO',
        entidadeId: id,
        usuario: { id: usuario.id, email: usuario.email },
        contexto,
      },
      anterior,
      { nome: grupo.nome, status: grupo.status, descricao: grupo.descricao },
      CAMPOS_AUDITADOS,
    );

    if (dto.participanteIds !== undefined) {
      await this.auditoriaService.registrar({
        acao: AcaoAuditoria.GRUPO_ALTERADO,
        entidade: 'GRUPO',
        entidadeId: id,
        campoAlterado: 'participantes',
        valorNovo: `${dto.participanteIds.length} participante(s)`,
        usuario: { id: usuario.id, email: usuario.email },
        contexto,
      });
    }

    return this.buscarPorId(id);
  }

  async remover(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<void> {
    const grupo = await this.buscarPorId(id);

    const comitesVinculados = await this.comites.count({ where: { grupoId: id } });
    if (comitesVinculados) {
      throw new ExcecaoNegocio(
        `Não é possível excluir o grupo: existem ${comitesVinculados} comitê(s) vinculado(s)`,
        'GRUPO_COM_COMITES',
        { comitesVinculados },
      );
    }

    await this.repositorio.remove(grupo);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.GRUPO_EXCLUIDO,
      entidade: 'GRUPO',
      entidadeId: id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { nome: grupo.nome, codigo: grupo.codigo },
      contexto,
    });
  }

  /** Inclusão em lote de participantes (checkbox "adicionar selecionados"). */
  async adicionarParticipantes(
    id: string,
    participanteIds: string[],
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<{ adicionados: number; totalNoGrupo: number }> {
    await this.garantirExistencia(id);
    await this.participantesService.validarIds(participanteIds);

    const antes = await this.contarParticipantes(id);
    await this.repositorio.createQueryBuilder().relation(Grupo, 'participantes').of(id).add(
      await this.filtrarNaoVinculados(id, participanteIds),
    );
    const depois = await this.contarParticipantes(id);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.PARTICIPANTE_INCLUIDO,
      entidade: 'GRUPO',
      entidadeId: id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { participanteIds, adicionados: depois - antes },
      contexto,
    });

    return { adicionados: depois - antes, totalNoGrupo: depois };
  }

  /** Remoção em lote de participantes ("remover seleção"). */
  async removerParticipantes(
    id: string,
    participanteIds: string[],
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<{ removidos: number; totalNoGrupo: number }> {
    await this.garantirExistencia(id);

    const antes = await this.contarParticipantes(id);
    await this.repositorio.createQueryBuilder().relation(Grupo, 'participantes').of(id).remove(participanteIds);
    const depois = await this.contarParticipantes(id);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.PARTICIPANTE_REMOVIDO,
      entidade: 'GRUPO',
      entidadeId: id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { participanteIds, removidos: antes - depois },
      contexto,
    });

    return { removidos: antes - depois, totalNoGrupo: depois };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async montarResponsaveis(
    consultoraIds: string[] | undefined,
    backupIds: string[] | undefined,
    criador: UsuarioAutenticado | null,
  ): Promise<GrupoResponsavel[]> {
    await this.usuariosService.buscarPorIds([...(consultoraIds ?? []), ...(backupIds ?? [])]);

    const responsaveis: GrupoResponsavel[] = [];
    const adicionar = (usuarioId: string, papel: PapelResponsavel) => {
      responsaveis.push(this.responsaveis.create({ usuarioId, papel }));
    };

    (consultoraIds ?? []).forEach((usuarioId) => adicionar(usuarioId, PapelResponsavel.CONSULTORA));
    (backupIds ?? []).forEach((usuarioId) => adicionar(usuarioId, PapelResponsavel.BACKUP));
    if (criador) adicionar(criador.id, PapelResponsavel.CRIADOR);

    return responsaveis;
  }

  private async garantirExistencia(id: string): Promise<void> {
    if (!(await this.repositorio.countBy({ id }))) {
      throw new NotFoundException(`Grupo ${id} não encontrado`);
    }
  }

  /** Contagem direta na tabela de junção — evita carregar milhares de linhas. */
  private async contarParticipantes(grupoId: string): Promise<number> {
    const linha = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from('grupo_participantes', 'gp')
      .where('gp.grupo_id = :grupoId', { grupoId })
      .getRawOne<{ total: string }>();
    return Number(linha?.total ?? 0);
  }

  /** Evita erro de chave duplicada ao readicionar quem já está no grupo. */
  private async filtrarNaoVinculados(grupoId: string, participanteIds: string[]): Promise<string[]> {
    if (!participanteIds.length) return [];

    const linhas = await this.dataSource
      .createQueryBuilder()
      .select('gp.participante_id', 'id')
      .from('grupo_participantes', 'gp')
      .where('gp.grupo_id = :grupoId', { grupoId })
      .andWhere('gp.participante_id IN (:...ids)', { ids: participanteIds })
      .getRawMany<{ id: string }>();

    const jaVinculados = new Set(linhas.map((linha) => linha.id));
    return participanteIds.filter((id) => !jaVinculados.has(id));
  }
}
