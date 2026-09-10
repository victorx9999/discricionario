import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, OrigemAuditoria } from '../common/enums';
import { ConsultarAuditoriaQueryDto } from './dto/consultar-auditoria-query.dto';
import { RegistrarAuditoriaDto } from './dto/registrar-auditoria.dto';
import { LogAuditoria } from './entities/log-auditoria.entity';

/**
 * Serviço central de auditoria.
 *
 * Todos os módulos de negócio chamam este serviço após operações relevantes.
 * Regras importantes:
 *  - a tabela é append-only (sem update/delete);
 *  - uma falha ao auditar nunca derruba a operação de negócio (é logada);
 *  - quando a operação acontece dentro de uma transação, o `EntityManager`
 *    pode ser repassado para que o log siga o mesmo commit/rollback.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(LogAuditoria)
    private readonly repositorio: Repository<LogAuditoria>,
  ) {}

  /** Registra uma ação. Nunca lança — falhas de auditoria são apenas logadas. */
  async registrar(dto: RegistrarAuditoriaDto, manager?: EntityManager): Promise<LogAuditoria | null> {
    try {
      const repositorio = manager ? manager.getRepository(LogAuditoria) : this.repositorio;
      const log = repositorio.create(this.montarEntidade(dto));
      return await repositorio.save(log);
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar auditoria (${dto.acao} / ${dto.entidade})`,
        erro instanceof Error ? erro.stack : String(erro),
      );
      return null;
    }
  }

  /** Registra várias ações de uma vez (usado em operações em lote). */
  async registrarMuitos(dtos: RegistrarAuditoriaDto[], manager?: EntityManager): Promise<void> {
    if (!dtos.length) return;
    try {
      const repositorio = manager ? manager.getRepository(LogAuditoria) : this.repositorio;
      await repositorio.insert(dtos.map((dto) => this.montarEntidade(dto)));
    } catch (erro) {
      this.logger.error(
        `Falha ao registrar ${dtos.length} logs de auditoria`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  /**
   * Compara dois objetos e registra um log por campo alterado.
   * Usado nas atualizações de grupo, comitê e discricionário.
   */
  async registrarAlteracoes(
    base: Omit<RegistrarAuditoriaDto, 'valorAnterior' | 'valorNovo' | 'campoAlterado'>,
    anterior: Record<string, unknown>,
    novo: Record<string, unknown>,
    camposMonitorados?: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const campos = camposMonitorados ?? Object.keys(novo);
    const alteracoes: RegistrarAuditoriaDto[] = [];

    for (const campo of campos) {
      if (!(campo in novo)) continue;
      const de = anterior?.[campo];
      const para = novo[campo];
      if (this.saoIguais(de, para)) continue;

      alteracoes.push({ ...base, campoAlterado: campo, valorAnterior: de, valorNovo: para });
    }

    await this.registrarMuitos(alteracoes, manager);
  }

  /** Consulta paginada dos logs, com filtros no banco. */
  async listar(query: ConsultarAuditoriaQueryDto): Promise<ResultadoPaginado<LogAuditoria>> {
    const where: Record<string, unknown> = {};

    if (query.acao) where.acao = query.acao;
    if (query.entidade) where.entidade = query.entidade;
    if (query.entidadeId) where.entidadeId = query.entidadeId;
    if (query.usuarioId) where.usuarioId = query.usuarioId;
    if (query.comiteId) where.comiteId = query.comiteId;
    if (query.participanteId) where.participanteId = query.participanteId;
    if (query.origem) where.origem = query.origem;

    if (query.dataInicio && query.dataFim) {
      where.criadoEm = Between(new Date(query.dataInicio), new Date(query.dataFim));
    } else if (query.dataInicio) {
      where.criadoEm = MoreThanOrEqual(new Date(query.dataInicio));
    } else if (query.dataFim) {
      where.criadoEm = LessThanOrEqual(new Date(query.dataFim));
    }

    const resultado = await this.repositorio.findAndCount({
      where,
      order: { criadoEm: 'DESC' },
      skip: query.skip,
      take: query.take,
      relations: { usuario: true },
    });

    return ResultadoPaginado.de(resultado, query);
  }

  /** Histórico de um participante dentro de um comitê. */
  async listarPorParticipanteNoComite(comiteId: string, participanteId: string): Promise<LogAuditoria[]> {
    return this.repositorio.find({
      where: { comiteId, participanteId },
      order: { criadoEm: 'DESC' },
      take: 200,
    });
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private montarEntidade(dto: RegistrarAuditoriaDto): Partial<LogAuditoria> {
    return {
      acao: dto.acao,
      entidade: dto.entidade,
      entidadeId: dto.entidadeId ?? null,
      usuarioId: dto.usuario?.id ?? null,
      usuarioEmail: dto.usuario?.email ?? null,
      comiteId: dto.comiteId ?? null,
      participanteId: dto.participanteId ?? null,
      campoAlterado: dto.campoAlterado ?? null,
      valorAnterior: this.serializar(dto.valorAnterior),
      valorNovo: this.serializar(dto.valorNovo),
      justificativa: dto.justificativa ?? null,
      detalhes: dto.detalhes ?? null,
      origem: dto.origem ?? OrigemAuditoria.BACKEND,
      ip: dto.contexto?.ip ?? null,
      userAgent: dto.contexto?.userAgent?.slice(0, 300) ?? null,
    };
  }

  private serializar(valor: unknown): string | null {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
    if (valor instanceof Date) return valor.toISOString();
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }

  private saoIguais(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined || b === '';
    if (b === null || b === undefined) return a === '';
    if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
    return this.serializar(a) === this.serializar(b);
  }
}

export { AcaoAuditoria };
