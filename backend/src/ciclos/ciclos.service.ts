import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, OperacaoAuditoria, StatusCiclo } from '../common/enums';
import { ExcecaoNegocio } from '../common/filters';
import { AtualizarPremissasDto, CriarCicloDto, ListarCiclosQueryDto } from './dto';
import { Ciclo } from './entities/ciclo.entity';

const CAMPOS_PREMISSA: Array<keyof AtualizarPremissasDto> = [
  'percentualPool',
  'limiteFd',
  'bloquearPoolExcedido',
  'divisorHcMax',
  'fatorPep',
  'fatorDiferimento',
  'tipoSimuladorPerformance',
  'motivoObrigatorio',
  'ataObrigatoria',
  'descricao',
];

/**
 * Ciclos (anos-base) e premissas vigentes.
 *
 * Todo o resto do sistema pergunta a este serviço qual ciclo usar. Um ciclo
 * FECHADO é histórico: continua consultável por Admin e Atendimento, mas não
 * aceita carga, criação de comitê nem lançamento.
 */
@Injectable()
export class CiclosService {
  constructor(
    @InjectRepository(Ciclo)
    private readonly repositorio: Repository<Ciclo>,
    private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listar(query: ListarCiclosQueryDto): Promise<ResultadoPaginado<Ciclo>> {
    const qb = this.repositorio.createQueryBuilder('ciclo');

    if (query.withDeleted) qb.withDeleted();
    if (query.status) qb.andWhere('ciclo.status = :status', { status: query.status });

    qb.orderBy('ciclo.ano', 'DESC').skip(query.skip).take(query.take);

    return ResultadoPaginado.de(await qb.getManyAndCount(), query);
  }

  async buscarPorId(id: string): Promise<Ciclo> {
    const ciclo = await this.repositorio.findOne({ where: { id }, withDeleted: true });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo ${id} não encontrado`);
    }
    return ciclo;
  }

  async buscarPorAno(ano: number): Promise<Ciclo> {
    const ciclo = await this.repositorio.findOne({ where: { ano } });
    if (!ciclo) {
      throw new NotFoundException(`Ciclo do ano ${ano} não encontrado`);
    }
    return ciclo;
  }

  /** Ciclo ativo — usado como padrão quando a requisição não informa `?ciclo`. */
  async buscarAtivo(): Promise<Ciclo> {
    const ciclo = await this.repositorio.findOne({ where: { ativo: true } });
    if (!ciclo) {
      throw new ExcecaoNegocio(
        'Nenhum ciclo ativo configurado. Crie um ciclo e ative-o antes de operar o sistema.',
        'SEM_CICLO_ATIVO',
      );
    }
    return ciclo;
  }

  /**
   * Resolve o ciclo de uma requisição: o ano informado em `?ciclo` ou o ativo.
   * É o ponto único que garante que nenhuma consulta misture anos.
   */
  async resolver(ano?: number): Promise<Ciclo> {
    return ano ? this.buscarPorAno(ano) : this.buscarAtivo();
  }

  /** Resolve e exige que o ciclo aceite escrita. */
  async resolverParaEscrita(ano?: number): Promise<Ciclo> {
    const ciclo = await this.resolver(ano);
    this.garantirAberto(ciclo);
    return ciclo;
  }

  garantirAberto(ciclo: Ciclo): void {
    if (ciclo.status === StatusCiclo.FECHADO) {
      throw new ExcecaoNegocio(
        `O ciclo ${ciclo.ano} está fechado e é somente leitura. Reabra-o para permitir alterações.`,
        'CICLO_FECHADO',
        { ano: ciclo.ano },
      );
    }
  }

  /** Anos disponíveis para o seletor de ciclo do frontend. */
  async listarAnos(): Promise<Array<{ ano: number; status: StatusCiclo; ativo: boolean }>> {
    const ciclos = await this.repositorio.find({ order: { ano: 'DESC' } });
    return ciclos.map((ciclo) => ({ ano: ciclo.ano, status: ciclo.status, ativo: ciclo.ativo }));
  }

  // ------------------------------------------------------------------
  // Comandos
  // ------------------------------------------------------------------

  async criar(dto: CriarCicloDto, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Ciclo> {
    if (await this.repositorio.countBy({ ano: dto.ano })) {
      throw new ConflictException(`Já existe um ciclo para o ano ${dto.ano}`);
    }

    // Por padrão o novo ano nasce com as premissas do ano anterior.
    const anterior =
      dto.herdarPremissas === false
        ? null
        : await this.repositorio.findOne({ where: { ano: dto.ano - 1 } });

    const ciclo = this.repositorio.create({
      ano: dto.ano,
      descricao: dto.descricao ?? `Ciclo ${dto.ano}`,
      status: StatusCiclo.ABERTO,
      ativo: false,
      percentualPool: dto.percentualPool ?? anterior?.percentualPool ?? 0.01,
      limiteFd: dto.limiteFd ?? anterior?.limiteFd ?? 0.15,
      bloquearPoolExcedido: anterior?.bloquearPoolExcedido ?? true,
      divisorHcMax: anterior?.divisorHcMax ?? 3,
      fatorPep: anterior?.fatorPep ?? 0.725,
      fatorDiferimento: anterior?.fatorDiferimento ?? 0.7,
      tipoSimuladorPerformance: anterior?.tipoSimuladorPerformance ?? 'Institucional',
      motivoObrigatorio: anterior?.motivoObrigatorio ?? true,
      ataObrigatoria: anterior?.ataObrigatoria ?? true,
    });

    const salvo = await this.repositorio.save(ciclo);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.CICLO_CRIADO,
      operacao: OperacaoAuditoria.INSERT,
      entidade: 'CICLO',
      entidadeId: salvo.id,
      cicloId: salvo.id,
      usuario,
      detalhes: { ano: salvo.ano, herdouDe: anterior?.ano ?? null },
      contexto,
    });

    if (dto.ativar) {
      return this.ativar(salvo.id, usuario, contexto);
    }
    return salvo;
  }

  /** Torna o ciclo o ativo — apenas um por vez. */
  async ativar(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Ciclo> {
    const ciclo = await this.buscarPorId(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Ciclo, { ativo: true }, { ativo: false });
      await manager.update(Ciclo, { id }, { ativo: true });
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.CICLO_ATIVADO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'CICLO',
      entidadeId: id,
      cicloId: id,
      usuario,
      campoAlterado: 'ativo',
      valorAnterior: ciclo.ativo,
      valorNovo: true,
      contexto,
    });

    return this.buscarPorId(id);
  }

  /** Fecha o ciclo: vira histórico somente leitura. */
  async fechar(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Ciclo> {
    const ciclo = await this.buscarPorId(id);

    if (ciclo.status === StatusCiclo.FECHADO) {
      throw new ExcecaoNegocio(`O ciclo ${ciclo.ano} já está fechado`, 'CICLO_JA_FECHADO');
    }

    ciclo.status = StatusCiclo.FECHADO;
    ciclo.fechadoEm = new Date();
    await this.repositorio.save(ciclo);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.CICLO_FECHADO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'CICLO',
      entidadeId: id,
      cicloId: id,
      usuario,
      campoAlterado: 'status',
      valorAnterior: StatusCiclo.ABERTO,
      valorNovo: StatusCiclo.FECHADO,
      contexto,
    });

    return ciclo;
  }

  async reabrir(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<Ciclo> {
    const ciclo = await this.buscarPorId(id);

    ciclo.status = StatusCiclo.ABERTO;
    ciclo.fechadoEm = null;
    await this.repositorio.save(ciclo);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.CICLO_REABERTO,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'CICLO',
      entidadeId: id,
      cicloId: id,
      usuario,
      campoAlterado: 'status',
      valorAnterior: StatusCiclo.FECHADO,
      valorNovo: StatusCiclo.ABERTO,
      contexto,
    });

    return ciclo;
  }

  /** Atualiza as premissas — cada alteração vira um registro de auditoria. */
  async atualizarPremissas(
    id: string,
    dto: AtualizarPremissasDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Ciclo> {
    const ciclo = await this.buscarPorId(id);
    this.garantirAberto(ciclo);

    const anterior: Record<string, unknown> = {};
    const novo: Record<string, unknown> = {};

    for (const campo of CAMPOS_PREMISSA) {
      if (dto[campo] === undefined) continue;
      anterior[campo] = (ciclo as unknown as Record<string, unknown>)[campo];
      novo[campo] = dto[campo];
      (ciclo as unknown as Record<string, unknown>)[campo] = dto[campo];
    }

    await this.repositorio.save(ciclo);

    await this.auditoriaService.registrarAlteracoes(
      {
        acao: AcaoAuditoria.PREMISSA_ALTERADA,
        operacao: OperacaoAuditoria.UPDATE,
        entidade: 'CICLO',
        entidadeId: id,
        cicloId: id,
        usuario,
        contexto,
      },
      anterior,
      novo,
    );

    return ciclo;
  }
}
