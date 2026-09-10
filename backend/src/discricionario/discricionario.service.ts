import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, STATUS_COMITE_BLOQUEADOS, StatusAnalise } from '../common/enums';
import { ExcecaoNegocio } from '../common/filters';
import { AnaliseParticipante } from '../comites/entities/analise-participante.entity';
import {
  AtualizarDiscricionarioDto,
  DiscricionarioDto,
  ListarDiscricionariosQueryDto,
  ProximaAnaliseDto,
  RespostaDiscricionarioDto,
  SalvarDiscricionarioDto,
} from './dto';
import { AvaliacaoComportamental } from './entities/avaliacao-comportamental.entity';
import { Discricionario } from './entities/discricionario.entity';
import { CalculoService } from './services/calculo.service';
import { PoolService } from './services/pool.service';
import { ResumoService } from './services/resumo.service';

/**
 * Regras do discricionário.
 *
 * Sequência de gravação (a mesma para criação e alteração):
 *   1. validar  -> limite de ±15pp e situação do comitê
 *   2. calcular -> FPI_FINAL, PR inicial/final e impacto (CalculoService)
 *   3. validar o pool -> bloqueia o que ultrapassa o disponível
 *   4. persistir -> discricionário + status da análise (em transação)
 *   5. auditar   -> um registro por campo alterado
 *   6. atualizar pool e resumo -> devolvidos na própria resposta
 *   7. próximo participante, quando solicitado
 */
@Injectable()
export class DiscricionarioService {
  private readonly logger = new Logger(DiscricionarioService.name);

  constructor(
    @InjectRepository(Discricionario)
    private readonly repositorio: Repository<Discricionario>,
    @InjectRepository(AnaliseParticipante)
    private readonly analises: Repository<AnaliseParticipante>,
    @InjectRepository(AvaliacaoComportamental)
    private readonly avaliacoes: Repository<AvaliacaoComportamental>,
    private readonly dataSource: DataSource,
    private readonly calculoService: CalculoService,
    private readonly poolService: PoolService,
    private readonly resumoService: ResumoService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listar(query: ListarDiscricionariosQueryDto): Promise<ResultadoPaginado<DiscricionarioDto>> {
    const qb = this.repositorio
      .createQueryBuilder('discricionario')
      .innerJoinAndSelect('discricionario.analise', 'analise')
      .innerJoinAndSelect('analise.participante', 'participante')
      .leftJoinAndSelect('discricionario.avaliacaoComportamental', 'avaliacao');

    if (query.comiteId) qb.andWhere('analise.comite_id = :comiteId', { comiteId: query.comiteId });
    if (query.participanteId) {
      qb.andWhere('analise.participante_id = :participanteId', { participanteId: query.participanteId });
    }
    if (query.analiseId) qb.andWhere('discricionario.analise_id = :analiseId', { analiseId: query.analiseId });

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere('(participante.nome ILIKE :busca OR participante.funcional ILIKE :busca)', { busca });
    }

    qb.orderBy('discricionario.atualizado_em', 'DESC').skip(query.skip).take(query.take);

    const [registros, total] = await qb.getManyAndCount();
    return new ResultadoPaginado(
      registros.map((registro) => this.montarDto(registro)),
      total,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  async buscarPorId(id: string): Promise<Discricionario> {
    const discricionario = await this.repositorio.findOne({
      where: { id },
      relations: { analise: { participante: true, comite: true }, avaliacaoComportamental: true },
    });
    if (!discricionario) {
      throw new NotFoundException(`Discricionário ${id} não encontrado`);
    }
    return discricionario;
  }

  /** Opções da avaliação comportamental (tabela de domínio). */
  listarAvaliacoesComportamentais(): Promise<AvaliacaoComportamental[]> {
    return this.avaliacoes.find({ where: { ativo: true }, order: { ordem: 'ASC' } });
  }

  // ------------------------------------------------------------------
  // Comandos
  // ------------------------------------------------------------------

  /** Cria ou substitui o discricionário de uma análise. */
  salvar(
    dto: SalvarDiscricionarioDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<RespostaDiscricionarioDto> {
    return this.aplicar(dto.analiseId, dto, usuario, contexto);
  }

  /** Atualiza um discricionário existente. */
  async atualizar(
    id: string,
    dto: AtualizarDiscricionarioDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<RespostaDiscricionarioDto> {
    const atual = await this.buscarPorId(id);
    return this.aplicar(
      atual.analiseId,
      {
        analiseId: atual.analiseId,
        valorFd: dto.valorFd ?? atual.valorFd,
        avaliacaoComportamentalId: dto.avaliacaoComportamentalId,
        avaliacaoComportamentalCodigo: dto.avaliacaoComportamentalCodigo,
        justificativa: dto.justificativa,
        avancarParaProximo: dto.avancarParaProximo,
      },
      usuario,
      contexto,
    );
  }

  async remover(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<void> {
    const discricionario = await this.buscarPorId(id);
    const analise = discricionario.analise;

    this.garantirComiteEditavel(analise);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Discricionario, { id });
      await manager.update(
        AnaliseParticipante,
        { id: analise.id },
        { status: StatusAnalise.PENDENTE, analisadoPorId: null, analisadoEm: null },
      );
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.DISCRICIONARIO_REMOVIDO,
      entidade: 'DISCRICIONARIO',
      entidadeId: id,
      comiteId: analise.comiteId,
      participanteId: analise.participanteId,
      usuario: { id: usuario.id, email: usuario.email },
      campoAlterado: 'valorFd',
      valorAnterior: discricionario.valorFd,
      valorNovo: null,
      contexto,
    });
  }

  // ------------------------------------------------------------------
  // Núcleo do salvamento
  // ------------------------------------------------------------------

  private async aplicar(
    analiseId: string,
    dto: SalvarDiscricionarioDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<RespostaDiscricionarioDto> {
    // 1. Validar contexto
    const analise = await this.carregarAnalise(analiseId);
    this.garantirComiteEditavel(analise);

    const valorFd = this.calculoService.validarValorFd(dto.valorFd);
    const avaliacao = await this.resolverAvaliacao(dto);

    // 2. Calcular
    const participante = analise.participante;
    const calculo = this.calculoService.calcularParticipante({
      valorBase: participante.valorBase,
      fbpa: participante.fbpa,
      fpi: participante.fpi,
      fd: valorFd,
    });

    const existente = await this.repositorio.findOne({
      where: { analiseId },
      relations: { avaliacaoComportamental: true },
    });
    const anterior = existente
      ? {
          valorFd: Number(existente.valorFd),
          justificativa: existente.justificativa,
          avaliacaoComportamentalId: existente.avaliacaoComportamentalId,
          impactoFinanceiro: Number(existente.impactoFinanceiro),
        }
      : { valorFd: null, justificativa: null, avaliacaoComportamentalId: null, impactoFinanceiro: 0 };

    // 3. Validar pool (bloqueia o que ultrapassa o disponível)
    await this.poolService.validarLancamento(
      analise.comiteId,
      anterior.impactoFinanceiro,
      calculo.impactoFinanceiro,
    );

    // 4. Persistir
    const salvo = await this.dataSource.transaction(async (manager) => {
      const entidade = manager.create(Discricionario, {
        ...(existente ? { id: existente.id } : {}),
        analiseId,
        valorFd,
        avaliacaoComportamentalId:
          avaliacao !== undefined ? (avaliacao?.id ?? null) : anterior.avaliacaoComportamentalId,
        // Campo não informado mantém o valor atual; string vazia limpa.
        justificativa:
          dto.justificativa !== undefined ? dto.justificativa || null : (anterior.justificativa ?? null),
        fpiFinalCalculado: calculo.fpiFinal,
        valorPrICalculado: calculo.valorPrI,
        valorPrFCalculado: calculo.valorPrF,
        impactoFinanceiro: calculo.impactoFinanceiro,
        criadoPorId: existente?.criadoPorId ?? usuario.id,
        atualizadoPorId: usuario.id,
      });

      const persistido = await manager.save(Discricionario, entidade);

      await manager.update(
        AnaliseParticipante,
        { id: analiseId },
        { status: StatusAnalise.ANALISADO, analisadoPorId: usuario.id, analisadoEm: new Date() },
      );

      return persistido;
    });

    // 5. Auditar (um registro por campo alterado)
    await this.registrarAuditoria(analise, existente ? anterior : null, salvo, usuario, contexto);

    // 6. Pool e resumo atualizados
    const [pool, porNivelCargo, porModeloAvaliacao] = await Promise.all([
      this.poolService.consolidar(analise.comiteId),
      this.resumoService.resumoPorNivelCargo(analise.comiteId),
      this.resumoService.resumoPorModeloAvaliacao(analise.comiteId),
    ]);

    // 7. Próximo participante, quando solicitado
    const proximaAnalise = dto.avancarParaProximo
      ? await this.buscarProximaAnalise(analise.comiteId, analise.ordem)
      : null;

    const completo = await this.repositorio.findOne({
      where: { id: salvo.id },
      relations: { analise: { participante: true }, avaliacaoComportamental: true },
    });

    return {
      discricionario: this.montarDto(completo ?? salvo, analise),
      pool,
      resumoPorNivelCargo: porNivelCargo,
      resumoPorModeloAvaliacao: porModeloAvaliacao,
      proximaAnalise,
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private async carregarAnalise(analiseId: string): Promise<AnaliseParticipante> {
    const analise = await this.analises.findOne({
      where: { id: analiseId },
      relations: { participante: true, comite: true },
    });
    if (!analise) {
      throw new NotFoundException(`Análise ${analiseId} não encontrada`);
    }
    return analise;
  }

  private garantirComiteEditavel(analise: AnaliseParticipante): void {
    const status = analise.comite?.status;
    if (status && STATUS_COMITE_BLOQUEADOS.includes(status)) {
      throw new ExcecaoNegocio(
        `O comitê está com status ${status} e não aceita alterações de discricionário`,
        'COMITE_NAO_EDITAVEL',
        { comiteId: analise.comiteId, status },
      );
    }
  }

  /**
   * Resolve a avaliação comportamental informada.
   * `undefined` = não informada (mantém a atual); `null` = limpar.
   */
  private async resolverAvaliacao(
    dto: SalvarDiscricionarioDto,
  ): Promise<AvaliacaoComportamental | null | undefined> {
    if (dto.avaliacaoComportamentalId) {
      const avaliacao = await this.avaliacoes.findOne({ where: { id: dto.avaliacaoComportamentalId } });
      if (!avaliacao) {
        throw new NotFoundException(
          `Avaliação comportamental ${dto.avaliacaoComportamentalId} não encontrada`,
        );
      }
      return avaliacao;
    }

    if (dto.avaliacaoComportamentalCodigo) {
      const avaliacao = await this.avaliacoes.findOne({
        where: { codigo: dto.avaliacaoComportamentalCodigo },
      });
      if (!avaliacao) {
        throw new NotFoundException(
          `Avaliação comportamental "${dto.avaliacaoComportamentalCodigo}" não encontrada`,
        );
      }
      return avaliacao;
    }

    return undefined;
  }

  private async registrarAuditoria(
    analise: AnaliseParticipante,
    anterior: {
      valorFd: number | null;
      justificativa: string | null;
      avaliacaoComportamentalId: string | null;
    } | null,
    novo: Discricionario,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<void> {
    const base = {
      entidade: 'DISCRICIONARIO',
      entidadeId: novo.id,
      comiteId: analise.comiteId,
      participanteId: analise.participanteId,
      usuario: { id: usuario.id, email: usuario.email },
      justificativa: novo.justificativa,
      contexto,
    };

    if (!anterior) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.DISCRICIONARIO_CRIADO,
        campoAlterado: 'valorFd',
        valorAnterior: null,
        valorNovo: novo.valorFd,
        detalhes: {
          impactoFinanceiro: Number(novo.impactoFinanceiro),
          fpiFinal: Number(novo.fpiFinalCalculado),
          participante: analise.participante?.nome,
        },
      });
      return;
    }

    if (Number(anterior.valorFd) !== Number(novo.valorFd)) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.DISCRICIONARIO_ALTERADO,
        campoAlterado: 'valorFd',
        valorAnterior: anterior.valorFd,
        valorNovo: novo.valorFd,
        detalhes: { impactoFinanceiro: Number(novo.impactoFinanceiro) },
      });
    }

    if ((anterior.justificativa ?? null) !== (novo.justificativa ?? null)) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.JUSTIFICATIVA_ALTERADA,
        campoAlterado: 'justificativa',
        valorAnterior: anterior.justificativa,
        valorNovo: novo.justificativa,
      });
    }

    if ((anterior.avaliacaoComportamentalId ?? null) !== (novo.avaliacaoComportamentalId ?? null)) {
      await this.auditoriaService.registrar({
        ...base,
        acao: AcaoAuditoria.AVALIACAO_COMPORTAMENTAL_ALTERADA,
        campoAlterado: 'avaliacaoComportamental',
        valorAnterior: anterior.avaliacaoComportamentalId,
        valorNovo: novo.avaliacaoComportamentalId,
      });
    }
  }

  /** Próxima análise na ordem de navegação do comitê. */
  private async buscarProximaAnalise(comiteId: string, ordemAtual: number): Promise<ProximaAnaliseDto | null> {
    const proxima = await this.analises.findOne({
      where: { comiteId, ordem: MoreThan(ordemAtual) },
      order: { ordem: 'ASC' },
      relations: { participante: true },
    });

    if (!proxima) return null;

    return {
      analiseId: proxima.id,
      participanteId: proxima.participanteId,
      nome: proxima.participante.nome,
      funcional: proxima.participante.funcional,
      ordem: proxima.ordem,
    };
  }

  private montarDto(registro: Discricionario, analise?: AnaliseParticipante): DiscricionarioDto {
    const analiseResolvida = registro.analise ?? analise;

    return {
      id: registro.id,
      analiseId: registro.analiseId,
      comiteId: analiseResolvida?.comiteId ?? null,
      participanteId: analiseResolvida?.participanteId ?? null,
      valorFd: Number(registro.valorFd),
      valorFdPp: this.calculoService.formatarPp(Number(registro.valorFd)),
      avaliacaoComportamentalId: registro.avaliacaoComportamentalId,
      avaliacaoComportamentalCodigo: registro.avaliacaoComportamental?.codigo ?? null,
      justificativa: registro.justificativa,
      fpiFinalCalculado: Number(registro.fpiFinalCalculado),
      valorPrICalculado: Number(registro.valorPrICalculado),
      valorPrFCalculado: Number(registro.valorPrFCalculado),
      impactoFinanceiro: Number(registro.impactoFinanceiro),
      statusAnalise: analiseResolvida?.status ?? StatusAnalise.ANALISADO,
      atualizadoEm: registro.atualizadoEm,
    };
  }
}
