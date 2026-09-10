import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, StatusAnalise, StatusComite } from '../common/enums';
import { ExcecaoNegocio } from '../common/filters';
import { paraMoeda, resolverDirecao, resolverOrdenacao } from '../common/utils';
import { DiscricionarioDto } from '../discricionario/dto';
import { CalculoService } from '../discricionario/services/calculo.service';
import { PoolService } from '../discricionario/services/pool.service';
import { ResumoComite, ResumoService } from '../discricionario/services/resumo.service';
import { Grupo } from '../grupos/entities/grupo.entity';
import { ParticipantesService } from '../participantes/participantes.service';
import {
  AnaliseDetalheDto,
  AnaliseResumoDto,
  AtualizarComiteDto,
  CriarComiteDto,
  DirecaoNavegacao,
  ListarAnalisesQueryDto,
  ListarComitesQueryDto,
  NavegacaoQueryDto,
} from './dto';
import { AnaliseParticipante } from './entities/analise-participante.entity';
import { Comite } from './entities/comite.entity';

const CAMPOS_ORDENACAO_COMITE = {
  nome: 'comite.nome',
  codigo: 'comite.codigo',
  status: 'comite.status',
  criadoEm: 'comite.criadoEm',
  atualizadoEm: 'comite.atualizadoEm',
};

const CAMPOS_ORDENACAO_ANALISE = {
  ordem: 'analise.ordem',
  nome: 'participante.nome',
  funcional: 'participante.funcional',
  nivelCargo: 'participante.nivelCargo',
  area: 'participante.area',
  status: 'analise.status',
  vlrTeorico: 'participante.vlrTeorico',
};

const CAMPOS_AUDITADOS = ['nome', 'status', 'descricao'];

@Injectable()
export class ComitesService {
  constructor(
    @InjectRepository(Comite)
    private readonly repositorio: Repository<Comite>,
    @InjectRepository(AnaliseParticipante)
    private readonly analises: Repository<AnaliseParticipante>,
    @InjectRepository(Grupo)
    private readonly grupos: Repository<Grupo>,
    private readonly dataSource: DataSource,
    private readonly participantesService: ParticipantesService,
    private readonly poolService: PoolService,
    private readonly resumoService: ResumoService,
    private readonly calculoService: CalculoService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async listar(query: ListarComitesQueryDto): Promise<ResultadoPaginado<Comite>> {
    const qb = this.repositorio
      .createQueryBuilder('comite')
      .leftJoin('comite.grupo', 'grupo')
      .addSelect(['grupo.id', 'grupo.nome', 'grupo.codigo', 'grupo.status'])
      .loadRelationCountAndMap('comite.totalParticipantes', 'comite.analises')
      .loadRelationCountAndMap(
        'comite.totalAnalisados',
        'comite.analises',
        'analiseAnalisada',
        (sub) => sub.where('analiseAnalisada.status = :status', { status: StatusAnalise.ANALISADO }),
      );

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('comite.nome ILIKE :busca', { busca }).orWhere('comite.codigo ILIKE :busca', { busca });
        }),
      );
    }
    if (query.status) qb.andWhere('comite.status = :status', { status: query.status });
    if (query.grupoId) qb.andWhere('comite.grupo_id = :grupoId', { grupoId: query.grupoId });

    qb.orderBy(
      resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO_COMITE, 'criadoEm'),
      resolverDirecao(query.sortOrder ?? 'DESC'),
    )
      .skip(query.skip)
      .take(query.take);

    return ResultadoPaginado.de(await qb.getManyAndCount(), query);
  }

  async buscarPorId(id: string): Promise<Comite> {
    const comite = await this.repositorio
      .createQueryBuilder('comite')
      .leftJoinAndSelect('comite.grupo', 'grupo')
      .leftJoin('comite.criadoPor', 'criadoPor')
      .addSelect(['criadoPor.id', 'criadoPor.nome', 'criadoPor.email'])
      .loadRelationCountAndMap('comite.totalParticipantes', 'comite.analises')
      .where('comite.id = :id', { id })
      .getOne();

    if (!comite) {
      throw new NotFoundException(`Comitê ${id} não encontrado`);
    }
    return comite;
  }

  /**
   * Cria o comitê e materializa a navegação: uma análise por participante,
   * numerada em `ordem` (usada por primeiro/anterior/próximo/último).
   */
  async criar(
    dto: CriarComiteDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    if (await this.repositorio.countBy({ codigo: dto.codigo })) {
      throw new ConflictException(`Já existe um comitê com o código ${dto.codigo}`);
    }

    const grupo = await this.grupos.findOne({
      where: { id: dto.grupoId },
      relations: { participantes: true },
    });
    if (!grupo) {
      throw new NotFoundException(`Grupo ${dto.grupoId} não encontrado`);
    }

    let participantes = grupo.participantes ?? [];
    if (dto.participanteIds?.length) {
      const selecionados = new Set(dto.participanteIds);
      participantes = participantes.filter((participante) => selecionados.has(participante.id));

      if (participantes.length !== selecionados.size) {
        throw new ExcecaoNegocio(
          'Há participantes selecionados que não pertencem ao grupo informado',
          'PARTICIPANTE_FORA_DO_GRUPO',
        );
      }
    }

    if (!participantes.length) {
      throw new ExcecaoNegocio(
        'O grupo não possui participantes: inclua participantes antes de criar o comitê',
        'GRUPO_SEM_PARTICIPANTES',
        { grupoId: dto.grupoId },
      );
    }

    // Ordem alfabética estável para a navegação participante a participante.
    const ordenados = [...participantes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const comiteSalvo = await this.dataSource.transaction(async (manager) => {
      const comite = await manager.save(
        manager.create(Comite, {
          nome: dto.nome,
          codigo: dto.codigo,
          grupoId: dto.grupoId,
          status: dto.status ?? StatusComite.RASCUNHO,
          descricao: dto.descricao ?? null,
          criadoPorId: usuario.id,
        }),
      );

      await manager.insert(
        AnaliseParticipante,
        ordenados.map((participante, indice) => ({
          comiteId: comite.id,
          participanteId: participante.id,
          ordem: indice + 1,
          status: StatusAnalise.PENDENTE,
        })),
      );

      return comite;
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_CRIADO,
      entidade: 'COMITE',
      entidadeId: comiteSalvo.id,
      comiteId: comiteSalvo.id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: {
        nome: dto.nome,
        codigo: dto.codigo,
        grupoId: dto.grupoId,
        totalParticipantes: ordenados.length,
      },
      contexto,
    });

    return this.buscarPorId(comiteSalvo.id);
  }

  async atualizar(
    id: string,
    dto: AtualizarComiteDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    const comite = await this.buscarPorId(id);
    const anterior = { nome: comite.nome, status: comite.status, descricao: comite.descricao };

    if (dto.nome !== undefined) comite.nome = dto.nome;
    if (dto.descricao !== undefined) comite.descricao = dto.descricao;
    if (dto.status !== undefined) {
      comite.status = dto.status;
      if (dto.status === StatusComite.FINALIZADO) comite.finalizadoEm = new Date();
      if (dto.status === StatusComite.APROVADO) comite.aprovadoEm = new Date();
    }

    await this.repositorio.save(comite);

    await this.auditoriaService.registrarAlteracoes(
      {
        acao: AcaoAuditoria.COMITE_ALTERADO,
        entidade: 'COMITE',
        entidadeId: id,
        comiteId: id,
        usuario: { id: usuario.id, email: usuario.email },
        contexto,
      },
      anterior,
      { nome: comite.nome, status: comite.status, descricao: comite.descricao },
      CAMPOS_AUDITADOS,
    );

    return this.buscarPorId(id);
  }

  /** Finaliza ou aprova o comitê — a partir daí ele não aceita mais lançamentos. */
  async alterarSituacao(
    id: string,
    novoStatus: StatusComite.FINALIZADO | StatusComite.APROVADO,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Comite> {
    const comite = await this.buscarPorId(id);

    if (novoStatus === StatusComite.FINALIZADO) {
      const pendentes = await this.analises.count({
        where: { comiteId: id, status: StatusAnalise.PENDENTE },
      });
      if (pendentes) {
        throw new ExcecaoNegocio(
          `Não é possível finalizar: ${pendentes} participante(s) ainda sem análise`,
          'COMITE_COM_PENDENCIAS',
          { pendentes },
        );
      }
    }

    if (novoStatus === StatusComite.APROVADO && comite.status !== StatusComite.FINALIZADO) {
      throw new ExcecaoNegocio(
        'Somente comitês finalizados podem ser aprovados',
        'COMITE_NAO_FINALIZADO',
        { statusAtual: comite.status },
      );
    }

    comite.status = novoStatus;
    if (novoStatus === StatusComite.FINALIZADO) comite.finalizadoEm = new Date();
    if (novoStatus === StatusComite.APROVADO) comite.aprovadoEm = new Date();
    await this.repositorio.save(comite);

    await this.auditoriaService.registrar({
      acao:
        novoStatus === StatusComite.FINALIZADO
          ? AcaoAuditoria.COMITE_FINALIZADO
          : AcaoAuditoria.COMITE_APROVADO,
      entidade: 'COMITE',
      entidadeId: id,
      comiteId: id,
      campoAlterado: 'status',
      valorNovo: novoStatus,
      usuario: { id: usuario.id, email: usuario.email },
      contexto,
    });

    return this.buscarPorId(id);
  }

  async remover(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<void> {
    const comite = await this.buscarPorId(id);
    await this.repositorio.remove(comite);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COMITE_EXCLUIDO,
      entidade: 'COMITE',
      entidadeId: id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { nome: comite.nome, codigo: comite.codigo },
      contexto,
    });
  }

  // ------------------------------------------------------------------
  // Tela do comitê — parte 1: navegação
  // ------------------------------------------------------------------

  /** Tabela paginada dos participantes do comitê. */
  async listarAnalises(
    comiteId: string,
    query: ListarAnalisesQueryDto,
  ): Promise<ResultadoPaginado<AnaliseResumoDto>> {
    await this.garantirExistencia(comiteId);

    const qb = this.analises
      .createQueryBuilder('analise')
      .innerJoinAndSelect('analise.participante', 'participante')
      .leftJoinAndSelect('participante.acrescimos', 'acrescimo')
      .leftJoinAndSelect('analise.discricionario', 'discricionario')
      .where('analise.comite_id = :comiteId', { comiteId });

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('participante.nome ILIKE :busca', { busca })
            .orWhere('participante.funcional ILIKE :busca', { busca });
        }),
      );
    }
    if (query.status) qb.andWhere('analise.status = :status', { status: query.status });
    if (query.nivelCargo) qb.andWhere('participante.nivelCargo = :nivelCargo', { nivelCargo: query.nivelCargo });
    if (query.modeloAvaliacao) {
      qb.andWhere('participante.modeloAvaliacao = :modeloAvaliacao', {
        modeloAvaliacao: query.modeloAvaliacao,
      });
    }
    if (query.area) qb.andWhere('participante.area = :area', { area: query.area });

    qb.orderBy(
      resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO_ANALISE, 'ordem'),
      resolverDirecao(query.sortOrder),
    )
      .skip(query.skip)
      .take(query.take);

    const [registros, total] = await qb.getManyAndCount();

    return new ResultadoPaginado(
      registros.map((analise) => this.montarResumo(analise)),
      total,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /** Detalhe completo do participante selecionado. */
  async detalharAnalise(comiteId: string, analiseId: string): Promise<AnaliseDetalheDto> {
    const analise = await this.analises.findOne({
      where: { id: analiseId, comiteId },
      relations: {
        participante: { acrescimos: true },
        discricionario: { avaliacaoComportamental: true },
      },
    });

    if (!analise) {
      throw new NotFoundException(`Análise ${analiseId} não encontrada no comitê ${comiteId}`);
    }

    const [total, anterior, proxima] = await Promise.all([
      this.analises.count({ where: { comiteId } }),
      this.analises.findOne({
        where: { comiteId, ordem: LessThan(analise.ordem) },
        order: { ordem: 'DESC' },
        select: { id: true },
      }),
      this.analises.findOne({
        where: { comiteId, ordem: MoreThan(analise.ordem) },
        order: { ordem: 'ASC' },
        select: { id: true },
      }),
    ]);

    return {
      analiseId: analise.id,
      comiteId,
      ordem: analise.ordem,
      totalParticipantes: total,
      status: analise.status,
      participante: this.participantesService.montarDetalhe(analise.participante),
      discricionario: this.montarDiscricionarioDto(analise),
      analiseAnteriorId: anterior?.id ?? null,
      proximaAnaliseId: proxima?.id ?? null,
    };
  }

  /** Primeiro / anterior / próximo / último participante do comitê. */
  async navegar(comiteId: string, query: NavegacaoQueryDto): Promise<AnaliseDetalheDto> {
    await this.garantirExistencia(comiteId);

    const ordemAtual = await this.resolverOrdemAtual(comiteId, query);
    let alvo: AnaliseParticipante | null = null;

    switch (query.direcao) {
      case DirecaoNavegacao.PRIMEIRO:
        alvo = await this.analises.findOne({ where: { comiteId }, order: { ordem: 'ASC' } });
        break;
      case DirecaoNavegacao.ULTIMO:
        alvo = await this.analises.findOne({ where: { comiteId }, order: { ordem: 'DESC' } });
        break;
      case DirecaoNavegacao.ANTERIOR:
        alvo = await this.analises.findOne({
          where: { comiteId, ordem: LessThan(ordemAtual) },
          order: { ordem: 'DESC' },
        });
        break;
      case DirecaoNavegacao.PROXIMO:
        alvo = await this.analises.findOne({
          where: { comiteId, ordem: MoreThan(ordemAtual) },
          order: { ordem: 'ASC' },
        });
        break;
    }

    if (!alvo) {
      throw new ExcecaoNegocio(
        `Não há participante ${query.direcao} a partir da posição atual`,
        'NAVEGACAO_SEM_RESULTADO',
        { direcao: query.direcao, ordemAtual },
      );
    }

    return this.detalharAnalise(comiteId, alvo.id);
  }

  // ------------------------------------------------------------------
  // Tela do comitê — parte 2: pool e resumos
  // ------------------------------------------------------------------

  async resumo(comiteId: string): Promise<ResumoComite> {
    await this.garantirExistencia(comiteId);
    return this.resumoService.resumoComite(comiteId);
  }

  async pool(comiteId: string) {
    await this.garantirExistencia(comiteId);
    return this.poolService.consolidar(comiteId);
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async garantirExistencia(id: string): Promise<void> {
    if (!(await this.repositorio.countBy({ id }))) {
      throw new NotFoundException(`Comitê ${id} não encontrado`);
    }
  }

  private async resolverOrdemAtual(comiteId: string, query: NavegacaoQueryDto): Promise<number> {
    if (query.ordem) return query.ordem;

    if (query.analiseId) {
      const atual = await this.analises.findOne({
        where: { id: query.analiseId, comiteId },
        select: { ordem: true },
      });
      if (!atual) {
        throw new NotFoundException(`Análise ${query.analiseId} não encontrada no comitê ${comiteId}`);
      }
      return atual.ordem;
    }

    // Sem referência: anterior parte do fim, próximo parte do início.
    return query.direcao === DirecaoNavegacao.ANTERIOR ? Number.MAX_SAFE_INTEGER : 0;
  }

  private montarResumo(analise: AnaliseParticipante): AnaliseResumoDto {
    const participante = analise.participante;
    const anual = this.calculoService.aplicarAcrescimos(
      participante.valorPrI,
      participante.valorPrF,
      participante.acrescimos ?? [],
    );

    return {
      analiseId: analise.id,
      ordem: analise.ordem,
      status: analise.status,
      participanteId: participante.id,
      funcional: participante.funcional,
      nome: participante.nome,
      cargo: participante.cargo,
      nivelCargo: participante.nivelCargo,
      modeloAvaliacao: participante.modeloAvaliacao,
      area: participante.area,
      vlrTeorico: paraMoeda(participante.vlrTeorico),
      valorPrIAnual: anual.valorPrIAnual,
      valorPrFAnual: anual.valorPrFAnual,
      valorFd: analise.discricionario ? Number(analise.discricionario.valorFd) : null,
      impactoFinanceiro: analise.discricionario
        ? Number(analise.discricionario.impactoFinanceiro)
        : null,
    };
  }

  private montarDiscricionarioDto(analise: AnaliseParticipante): DiscricionarioDto | null {
    const discricionario = analise.discricionario;
    if (!discricionario) return null;

    return {
      id: discricionario.id,
      analiseId: analise.id,
      comiteId: analise.comiteId,
      participanteId: analise.participanteId,
      valorFd: Number(discricionario.valorFd),
      valorFdPp: this.calculoService.formatarPp(Number(discricionario.valorFd)),
      avaliacaoComportamentalId: discricionario.avaliacaoComportamentalId,
      avaliacaoComportamentalCodigo: discricionario.avaliacaoComportamental?.codigo ?? null,
      justificativa: discricionario.justificativa,
      fpiFinalCalculado: Number(discricionario.fpiFinalCalculado),
      valorPrICalculado: Number(discricionario.valorPrICalculado),
      valorPrFCalculado: Number(discricionario.valorPrFCalculado),
      impactoFinanceiro: Number(discricionario.impactoFinanceiro),
      statusAnalise: analise.status,
      atualizadoEm: discricionario.atualizadoEm,
    };
  }
}
