import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { aplicarVisibilidadeParticipante } from '../auth/visibilidade';
import { CalculoService, PremissasCalculo } from '../calculo/calculo.service';
import { CiclosService } from '../ciclos/ciclos.service';
import { Ciclo } from '../ciclos/entities/ciclo.entity';
import { ResultadoPaginado, aplicarFiltros } from '../common/dto';
import { AcaoAuditoria, OperacaoAuditoria, StatusComite } from '../common/enums';
import { ExcecaoNegocio, ExcecaoPool } from '../common/filters';
import { paraMoeda, resolverDirecao, resolverOrdenacao } from '../common/utils';
import { Comite } from '../comites/entities/comite.entity';
import { Motivo } from '../motivos/entities/motivo.entity';
import { COLUNAS_TABELA_PARTICIPANTES } from './colunas-participante';
import { LancarDiscricionarioDto, ListarParticipantesQueryDto, ParticipanteTabelaDto } from './dto';
import { Acrescimo } from './entities/acrescimo.entity';
import { Participante } from './entities/participante.entity';

const CAMPOS_ORDENACAO: Record<string, string> = {
  nome: 'participante.nome',
  emplid: 'participante.emplid',
  nivelCargo: 'participante.xlatlongname',
  xlatlongname: 'participante.xlatlongname',
  descrJobcode: 'participante.descrJobcode',
  area: 'participante.area',
  modeloAvaliacao: 'participante.modeloAvaliacao',
  nota: 'participante.nota',
  fpi: 'participante.fpi',
  fd: 'participante.fd',
  valorBase: 'participante.valorBase',
  vlPrI: 'participante.vlPrI',
  vlPrF: 'participante.vlPrF',
  vlrTeorico: 'participante.vlrTeorico',
  totalCash: 'participante.totalCash',
  dataAdmissao: 'participante.dataAdmissao',
  criadoEm: 'participante.criadoEm',
};

/** Campos aceitos pelo filtro dinâmico `?filter=campo:operador:valor`. */
const CAMPOS_FILTRAVEIS: Record<string, string> = {
  ...CAMPOS_ORDENACAO,
  cargo: 'participante.descrJobcode',
  empresa: 'participante.descrCompany',
  departamento: 'participante.descrDeptid',
  areaOrigem: 'participante.areaOrigem',
  grupoRanking: 'participante.grupoRanking',
  idpool: 'participante.idpool',
  idcurva: 'participante.idcurva',
  managerLevel: 'participante.managerLevel',
  statusContrato: 'participante.statusContrato',
  socioAno: 'participante.socioAno',
  codMotivador: 'participante.codMotivador',
  fdForaLimite: 'participante.fdForaLimite',
  comiteId: 'participante.comiteId',
};

@Injectable()
export class ParticipantesService {
  constructor(
    @InjectRepository(Participante) private readonly repositorio: Repository<Participante>,
    @InjectRepository(Acrescimo) private readonly acrescimos: Repository<Acrescimo>,
    @InjectRepository(Motivo) private readonly motivos: Repository<Motivo>,
    @InjectRepository(Comite) private readonly comites: Repository<Comite>,
    private readonly dataSource: DataSource,
    private readonly calculoService: CalculoService,
    private readonly ciclosService: CiclosService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  /** Tabela de participantes, paginada e já com os campos calculados. */
  async listar(
    query: ListarParticipantesQueryDto,
    usuario: UsuarioAutenticado,
  ): Promise<ResultadoPaginado<ParticipanteTabelaDto>> {
    const ciclo = await this.ciclosService.resolver(query.ciclo);
    const qb = this.montarQuery(ciclo, query, usuario);

    qb.orderBy(resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO, 'nome'), resolverDirecao(query.order))
      .skip(query.skip)
      .take(query.take);

    const [participantes, total] = await qb.getManyAndCount();
    const premissas = this.premissas(ciclo);

    return new ResultadoPaginado(
      participantes.map((participante) => this.montarLinha(participante, premissas)),
      total,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /** Apenas os IDs do filtro — sustenta o "selecionar todos" das telas. */
  async listarIds(
    query: ListarParticipantesQueryDto,
    usuario: UsuarioAutenticado,
  ): Promise<{ ids: string[]; total: number }> {
    const ciclo = await this.ciclosService.resolver(query.ciclo);
    const linhas = await this.montarQuery(ciclo, query, usuario)
      .select('participante.id', 'id')
      .getRawMany<{ id: string }>();

    const ids = linhas.map((linha) => linha.id);
    return { ids, total: ids.length };
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<Participante> {
    const qb = this.repositorio
      .createQueryBuilder('participante')
      .leftJoinAndSelect('participante.acrescimos', 'acrescimo')
      .leftJoinAndSelect('participante.motivo', 'motivo')
      .leftJoinAndSelect('participante.ciclo', 'ciclo')
      .where('participante.id = :id', { id });

    aplicarVisibilidadeParticipante(qb, 'participante', usuario);

    const participante = await qb.getOne();
    if (!participante) {
      throw new NotFoundException(`Participante ${id} não encontrado`);
    }
    return participante;
  }

  /** Detalhe já calculado, usado na tela de avaliação do comitê. */
  async detalhar(id: string, usuario: UsuarioAutenticado): Promise<ParticipanteTabelaDto> {
    const participante = await this.buscarPorId(id, usuario);
    const ciclo = participante.ciclo ?? (await this.ciclosService.buscarPorId(participante.cicloId));
    return this.montarLinha(participante, this.premissas(ciclo));
  }

  /** Série histórica do colaborador para os gráficos de RV / TC / TC+P.Sócios. */
  async graficos(id: string, usuario: UsuarioAutenticado) {
    const participante = await this.buscarPorId(id, usuario);
    const ciclo = participante.ciclo ?? (await this.ciclosService.buscarPorId(participante.cicloId));
    const premissas = this.premissas(ciclo);
    const linha = this.montarLinha(participante, premissas);

    const ano = ciclo.ano;

    return {
      participanteId: participante.id,
      nome: participante.nome,
      ciclo: ano,
      rotuloComparativo: ciclo.rotuloComparativo,
      series: {
        remuneracaoVariavel: [
          { ano: ano - 3, valor: Number(participante.prAnoAnterior3) },
          { ano: ano - 2, valor: Number(participante.prAnoAnterior2) },
          { ano: ano - 1, valor: Number(participante.prAnoAnterior1) },
          { ano, valor: linha.prPosDiscricionario, comDiscricionario: true },
        ],
        totalCash: [
          { ano: ano - 3, valor: Number(participante.totalCashAnoAnterior3) },
          { ano: ano - 2, valor: Number(participante.totalCashAnoAnterior2) },
          { ano: ano - 1, valor: Number(participante.totalCashAnoAnterior1) },
          { ano, valor: Number(participante.totalCash) },
        ],
        totalCashMaisSocios: [
          { ano: ano - 1, valor: linha.tcMaisSociosAnterior },
          { ano, valor: linha.tcMaisSociosAtual },
        ],
      },
      variacoes: {
        percentualRv: linha.percentualRv,
        percentualTc: linha.percentualTc,
        deltaTcMaisSocios: linha.deltaTcMaisSocios,
      },
    };
  }

  /** Valores distintos para popular os filtros das tabelas. */
  async listarOpcoesFiltro(ano?: number): Promise<Record<string, string[]>> {
    const ciclo = await this.ciclosService.resolver(ano);

    const distintos = async (coluna: string): Promise<string[]> => {
      const linhas = await this.repositorio
        .createQueryBuilder('participante')
        .select(`participante.${coluna}`, 'valor')
        .where('participante.ciclo_id = :cicloId', { cicloId: ciclo.id })
        .andWhere(`participante.${coluna} IS NOT NULL`)
        .groupBy(`participante.${coluna}`)
        .orderBy('valor', 'ASC')
        .getRawMany<{ valor: string }>();
      return linhas.map((linha) => linha.valor).filter(Boolean);
    };

    const [niveisCargo, cargos, areas, modelos, submodelos, empresas, grupos] = await Promise.all([
      distintos('xlatlongname'),
      distintos('descrJobcode'),
      distintos('area'),
      distintos('modeloAvaliacao'),
      distintos('descricaoSubmodelo'),
      distintos('descrCompany'),
      distintos('grupoRanking'),
    ]);

    return { niveisCargo, cargos, areas, modelos, submodelos, empresas, grupos };
  }

  /** Catálogo das colunas disponíveis para a tabela customizável. */
  listarColunasDisponiveis() {
    return {
      total: COLUNAS_TABELA_PARTICIPANTES.length,
      grupos: [...new Set(COLUNAS_TABELA_PARTICIPANTES.map((coluna) => coluna.grupo))],
      colunas: COLUNAS_TABELA_PARTICIPANTES,
    };
  }

  /** Pesquisa funcional: onde o colaborador está e qual sua situação. */
  async pesquisarFuncional(termo: string, ano: number | undefined, usuario: UsuarioAutenticado) {
    const ciclo = await this.ciclosService.resolver(ano);

    const qb = this.repositorio
      .createQueryBuilder('participante')
      .leftJoinAndSelect('participante.comite', 'comite')
      .leftJoinAndSelect('participante.acrescimos', 'acrescimo')
      .where('participante.ciclo_id = :cicloId', { cicloId: ciclo.id })
      .andWhere(
        new Brackets((sub) => {
          sub
            .where('participante.emplid = :termoExato', { termoExato: termo })
            .orWhere('participante.nome ILIKE :termo', { termo: `%${termo}%` });
        }),
      )
      .take(50);

    aplicarVisibilidadeParticipante(qb, 'participante', usuario);

    const encontrados = await qb.getMany();
    const premissas = this.premissas(ciclo);

    return encontrados.map((participante) => ({
      ...this.montarLinha(participante, premissas),
      comite: participante.comite
        ? {
            id: participante.comite.id,
            codigo: participante.comite.codigo,
            nome: participante.comite.nome,
            grupoRanking: participante.comite.grupoRanking,
            status: participante.comite.status,
          }
        : null,
      situacao: participante.comite
        ? participante.temDiscricionario
          ? 'Analisado'
          : 'Pendente de análise'
        : 'Elegível sem comitê',
    }));
  }

  // ------------------------------------------------------------------
  // Lançamento do discricionário
  // ------------------------------------------------------------------

  /**
   * Salva o discricionário de um participante.
   *
   * Sequência: valida contexto -> resolve motivador -> valida o FD e o limite
   * -> calcula -> valida o pool -> persiste -> audita campo a campo.
   */
  async lancarDiscricionario(
    id: string,
    dto: LancarDiscricionarioDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<ParticipanteTabelaDto> {
    const participante = await this.buscarPorId(id, usuario);
    const ciclo = participante.ciclo ?? (await this.ciclosService.buscarPorId(participante.cicloId));
    this.ciclosService.garantirAberto(ciclo);

    const comite = participante.comiteId
      ? await this.comites.findOne({ where: { id: participante.comiteId } })
      : null;

    if (!comite) {
      throw new ExcecaoNegocio(
        'O participante não está vinculado a nenhum comitê. Vincule-o antes de lançar o discricionário.',
        'PARTICIPANTE_SEM_COMITE',
        { participanteId: id },
      );
    }
    if (comite.status === StatusComite.CONCLUIDO) {
      throw new ExcecaoNegocio(
        'O comitê está concluído: nota, motivo, justificativa e ATA estão bloqueados. Reabra o comitê para editar.',
        'COMITE_CONCLUIDO',
        { comiteId: comite.id },
      );
    }

    const anterior = {
      fd: Number(participante.fd),
      codMotivador: participante.codMotivador,
      motivoDiscricionario: participante.motivoDiscricionario,
      observacaoPoscomite: participante.observacaoPoscomite,
    };

    const zerando = Number(dto.fd) === 0;
    const motivo = zerando ? null : await this.resolverMotivo(dto);

    const validacao = this.calculoService.validarFd(dto.fd, {
      limiteCiclo: Number(ciclo.limiteFd),
      limiteMotivo: motivo?.limiteFd ?? null,
      confirmado: dto.confirmarForaDoLimite,
    });

    // Motivador e justificativa são obrigatórios em todo lançamento não nulo.
    if (!zerando && ciclo.motivoObrigatorio) {
      if (!motivo) {
        throw new ExcecaoNegocio(
          'Todo discricionário concedido exige um motivador principal',
          'MOTIVADOR_OBRIGATORIO',
        );
      }
      if (motivo.exigeJustificativa && !dto.justificativa?.trim()) {
        throw new ExcecaoNegocio(
          'Todo discricionário concedido exige justificativa detalhada',
          'JUSTIFICATIVA_OBRIGATORIA',
        );
      }
    }

    const acrescimosElegiveis = (participante.acrescimos ?? []).filter(
      (acrescimo) => acrescimo.elegivel,
    );
    const premissas = this.premissas(ciclo);

    const calculo = this.calculoService.calcularParticipante(
      { ...participante, fd: validacao.valor },
      acrescimosElegiveis,
      premissas,
    );

    await this.validarPool(comite, ciclo, participante, calculo.diferencaDiscricionario);

    // Zerar o discricionário remove motivador e justificativa (seção 3.2).
    participante.fd = validacao.valor;
    participante.fdForaLimite = validacao.foraDoLimite;
    // Os dois valores saem do CALC4: VL_PR_I = CALC4 × FPI (não depende do FD)
    // e VL_PR_F = CALC4 × FPI_FINAL. Regravar o VL_PR_I mantém a coerência.
    participante.vlPrI = calculo.vlPrI;
    participante.vlPrF = calculo.vlPrF;
    participante.notaDiscricionario = zerando ? null : calculo.notaPosDiscricionario;
    participante.motivoId = zerando ? null : (motivo?.id ?? null);
    participante.codMotivador = zerando ? null : (motivo?.codigo ?? null);
    participante.motivoDiscricionario = zerando ? null : (motivo?.descricao ?? null);
    participante.observacaoPoscomite = zerando ? null : (dto.justificativa?.trim() ?? null);
    participante.lancadoPorId = zerando ? null : usuario.id;
    participante.lancadoEm = zerando ? null : new Date();

    await this.repositorio.save(participante);

    await this.registrarAuditoria(participante, comite, ciclo, anterior, validacao, usuario, contexto);

    return this.montarLinha(participante, premissas);
  }

  /** Remove o discricionário (equivale a lançar zero). */
  async removerDiscricionario(
    id: string,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<ParticipanteTabelaDto> {
    return this.lancarDiscricionario(id, { fd: 0 }, usuario, contexto);
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

  /** Converte a entidade na linha da tabela, com todos os campos calculados. */
  montarLinha(participante: Participante, premissas: PremissasCalculo): ParticipanteTabelaDto {
    const acrescimos = participante.acrescimos ?? [];
    const elegiveis = acrescimos.filter((acrescimo) => acrescimo.elegivel);
    const calculo = this.calculoService.calcularParticipante(participante, elegiveis, premissas);

    return {
      id: participante.id,
      emplid: participante.emplid,
      nome: participante.nome,
      nationalId: participante.nationalId,
      dataAdmissao: participante.dataAdmissao,

      xlatlongname: participante.xlatlongname,
      descrJobcode: participante.descrJobcode,
      managerLevel: participante.managerLevel,
      area: participante.area,
      areaOrigem: participante.areaOrigem,
      descrDeptid: participante.descrDeptid,
      descrCompany: participante.descrCompany,
      modeloAvaliacao: participante.modeloAvaliacao,
      descricaoSubmodelo: participante.descricaoSubmodelo,

      nota: Number(participante.nota),
      notaAnoAnterior: Number(participante.notaAnoAnterior),
      fpi: calculo.fpi,
      fpiFinal: calculo.fpiFinal,
      fpba: Number(participante.fpba),
      notaPosDiscricionario: participante.notaDiscricionario ?? calculo.notaPosDiscricionario,

      valorBase: Number(participante.valorBase),
      vbAnoAnterior: Number(participante.vbAnoAnterior),
      vlBaseMes: Number(participante.vlBaseMes),
      vlPrI: calculo.vlPrI,
      vlPrF: calculo.vlPrF,
      vlrTeorico: Number(participante.vlrTeorico),
      prAnoAnterior2: Number(participante.prAnoAnterior2),
      prSemDiscricionario: calculo.prSemDiscricionario,
      prPosDiscricionario: calculo.prPosDiscricionario,

      fd: calculo.fd,
      fdPp: this.calculoService.formatarPp(calculo.fd),
      codMotivador: participante.codMotivador,
      motivoDiscricionario: participante.motivoDiscricionario,
      observacaoPoscomite: participante.observacaoPoscomite,
      diferencaDiscricionario: calculo.diferencaDiscricionario,
      fdForaLimite: participante.fdForaLimite,
      pendente: participante.pendente,

      percentualRv: calculo.percentualRv,
      percentualTc: calculo.percentualTc,
      deltaTcMaisSocios: calculo.deltaTcMaisSocios,

      totalCash: Number(participante.totalCash),
      totalCashAnoAnterior2: Number(participante.totalCashAnoAnterior2),
      tcMaisSociosAtual: calculo.tcMaisSociosAtual,
      tcMaisSociosAnterior: calculo.tcMaisSociosAnterior,
      socioAno: participante.socioAno,

      grupoRanking: participante.grupoRanking,
      statusContrato: participante.statusContrato,
      idpool: participante.idpool,
      idcurva: participante.idcurva,
      comiteId: participante.comiteId,

      acrescimos: acrescimos.map((acrescimo) => ({
        id: acrescimo.id,
        area: acrescimo.area,
        vlrTeorico: Number(acrescimo.vlrTeorico),
        vlPrI: Number(acrescimo.vlPrI),
        elegivel: acrescimo.elegivel,
      })),
    };
  }

  private montarQuery(
    ciclo: Ciclo,
    query: ListarParticipantesQueryDto,
    usuario: UsuarioAutenticado,
  ): SelectQueryBuilder<Participante> {
    const qb = this.repositorio
      .createQueryBuilder('participante')
      .leftJoinAndSelect('participante.acrescimos', 'acrescimo')
      .where('participante.ciclo_id = :cicloId', { cicloId: ciclo.id });

    if (query.withDeleted) qb.withDeleted();

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('participante.nome ILIKE :busca', { busca })
            .orWhere('participante.emplid ILIKE :busca', { busca });
        }),
      );
    }

    if (query.emplid) qb.andWhere('participante.emplid = :emplid', { emplid: query.emplid });
    if (query.nivelCargo) {
      qb.andWhere('participante.xlatlongname = :nivelCargo', { nivelCargo: query.nivelCargo });
    }
    if (query.modeloAvaliacao) {
      qb.andWhere('participante.modeloAvaliacao = :modeloAvaliacao', {
        modeloAvaliacao: query.modeloAvaliacao,
      });
    }
    if (query.area) qb.andWhere('participante.area = :area', { area: query.area });
    if (query.grupoRanking) {
      qb.andWhere('participante.grupoRanking = :grupoRanking', { grupoRanking: query.grupoRanking });
    }
    if (query.comiteId) qb.andWhere('participante.comite_id = :comiteId', { comiteId: query.comiteId });
    if (query.semComite) qb.andWhere('participante.comite_id IS NULL');

    if (query.discricionario === 'com') qb.andWhere('participante.fd <> 0');
    if (query.discricionario === 'sem') qb.andWhere('participante.fd = 0');
    if (query.discricionario === 'pendentes') {
      qb.andWhere('participante.fd <> 0').andWhere(
        new Brackets((sub) => {
          sub
            .where('participante.cod_motivador IS NULL')
            .orWhere('participante.observacao_poscomite IS NULL')
            .orWhere("TRIM(participante.observacao_poscomite) = ''");
        }),
      );
    }

    aplicarFiltros(qb, query.filtros, CAMPOS_FILTRAVEIS);
    aplicarVisibilidadeParticipante(qb, 'participante', usuario);

    return qb;
  }

  private async resolverMotivo(dto: LancarDiscricionarioDto): Promise<Motivo | null> {
    if (dto.motivoId) {
      const motivo = await this.motivos.findOne({ where: { id: dto.motivoId, ativo: true } });
      if (!motivo) throw new NotFoundException(`Motivador ${dto.motivoId} não encontrado ou inativo`);
      return motivo;
    }
    if (dto.codMotivador !== undefined && dto.codMotivador !== null) {
      const motivo = await this.motivos.findOne({ where: { codigo: dto.codMotivador, ativo: true } });
      if (!motivo) {
        throw new NotFoundException(`Motivador de código ${dto.codMotivador} não encontrado ou inativo`);
      }
      return motivo;
    }
    return null;
  }

  /**
   * Pool do comitê após o lançamento.
   *
   * Por padrão o estouro é recusado. A premissa `bloquearPoolExcedido = false`
   * volta ao comportamento da documentação: aceita, sinaliza e cobra a
   * confirmação apenas na conclusão do comitê.
   */
  private async validarPool(
    comite: Comite,
    ciclo: Ciclo,
    participante: Participante,
    novaDiferenca: number,
  ): Promise<void> {
    if (!ciclo.bloquearPoolExcedido) return;

    const totais = await this.totaisDoComite(comite.id, participante.id);
    const consumidoProjetado = totais.consumido + novaDiferenca;

    const pool = this.calculoService.consolidarPool(
      totais.vlrTeorico,
      consumidoProjetado,
      Number(ciclo.percentualPool),
    );

    if (pool.excedido) {
      throw new ExcecaoPool(
        'Operação não permitida: o lançamento ultrapassa o pool disponível do comitê',
        {
          comiteId: comite.id,
          poolDisponivel: pool.poolDisponivel,
          poolConsumidoProjetado: pool.poolConsumido,
          excedente: Math.abs(pool.saldo),
          impactoSolicitado: novaDiferenca,
        },
      );
    }
  }

  /**
   * Totais do comitê: base do pool (VLR_TEORICO dos participantes + acréscimos
   * elegíveis) e consumo (soma das diferenças de PR).
   *
   * `participanteExcluido` tira do consumo o lançamento que está sendo
   * substituído — sem tirá-lo da base do pool, que independe do FD.
   */
  private async totaisDoComite(
    comiteId: string,
    participanteExcluido?: string,
  ): Promise<{ vlrTeorico: number; consumido: number }> {
    const participantes = await this.repositorio.find({
      where: { comiteId },
      relations: { acrescimos: true },
    });

    let vlrTeorico = 0;
    let consumido = 0;

    for (const participante of participantes) {
      const elegiveis = (participante.acrescimos ?? []).filter((acrescimo) => acrescimo.elegivel);

      vlrTeorico +=
        Number(participante.vlrTeorico) +
        elegiveis.reduce((total, acrescimo) => total + Number(acrescimo.vlrTeorico), 0);

      if (participante.id === participanteExcluido) continue;

      consumido += this.calculoService.calcularParticipante(
        participante,
        elegiveis,
      ).diferencaDiscricionario;
    }

    return { vlrTeorico: paraMoeda(vlrTeorico), consumido: paraMoeda(consumido) };
  }

  private async registrarAuditoria(
    participante: Participante,
    comite: Comite,
    ciclo: Ciclo,
    anterior: Record<string, unknown>,
    validacao: { foraDoLimite: boolean; limiteAplicado: number },
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<void> {
    const base = {
      entidade: 'PARTICIPANTE',
      entidadeId: participante.id,
      cicloId: ciclo.id,
      comiteId: comite.id,
      participanteId: participante.id,
      usuario,
      justificativa: participante.observacaoPoscomite,
      operacao: OperacaoAuditoria.UPDATE,
      contexto,
    };

    const novo = {
      fd: Number(participante.fd),
      codMotivador: participante.codMotivador,
      motivoDiscricionario: participante.motivoDiscricionario,
      observacaoPoscomite: participante.observacaoPoscomite,
    };

    if (Number(anterior.fd) !== novo.fd) {
      await this.auditoriaService.registrar({
        ...base,
        acao:
          novo.fd === 0
            ? AcaoAuditoria.DISCRICIONARIO_ZERADO
            : Number(anterior.fd) === 0
              ? AcaoAuditoria.DISCRICIONARIO_LANCADO
              : AcaoAuditoria.DISCRICIONARIO_ALTERADO,
        campoAlterado: 'fd',
        valorAnterior: anterior.fd,
        valorNovo: novo.fd,
        detalhes: {
          fdPp: this.calculoService.formatarPp(novo.fd),
          foraDoLimite: validacao.foraDoLimite,
          limiteAplicado: validacao.limiteAplicado,
        },
      });
    }

    if (validacao.foraDoLimite) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.DISCRICIONARIO_FORA_LIMITE,
        campoAlterado: 'fd',
        valorNovo: novo.fd,
        detalhes: { limiteAplicado: validacao.limiteAplicado },
      });
    }

    if (anterior.codMotivador !== novo.codMotivador) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.MOTIVADOR_ALTERADO,
        campoAlterado: 'codMotivador',
        valorAnterior: anterior.codMotivador,
        valorNovo: novo.codMotivador,
      });
    }

    if ((anterior.observacaoPoscomite ?? null) !== (novo.observacaoPoscomite ?? null)) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.JUSTIFICATIVA_ALTERADA,
        campoAlterado: 'observacaoPoscomite',
        valorAnterior: anterior.observacaoPoscomite,
        valorNovo: novo.observacaoPoscomite,
      });
    }
  }
}
