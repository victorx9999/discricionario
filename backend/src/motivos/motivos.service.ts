import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { PaginacaoQueryDto, ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, OperacaoAuditoria } from '../common/enums';
import { AtualizarMotivoDto, CriarMotivoDto } from './dto';
import { Motivo } from './entities/motivo.entity';

/** CRUD completo do catálogo de motivadores (seção 9.2 — /motivos). */
@Injectable()
export class MotivosService {
  constructor(
    @InjectRepository(Motivo) private readonly repositorio: Repository<Motivo>,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async listar(query: PaginacaoQueryDto): Promise<ResultadoPaginado<Motivo>> {
    const qb = this.repositorio.createQueryBuilder('motivo');

    if (query.withDeleted) qb.withDeleted();
    if (query.search) {
      qb.andWhere('motivo.descricao ILIKE :busca', { busca: `%${query.search}%` });
    }

    qb.orderBy('motivo.ordem', 'ASC').addOrderBy('motivo.codigo', 'ASC').skip(query.skip).take(query.take);

    return ResultadoPaginado.de(await qb.getManyAndCount(), query);
  }

  /** Opções ativas para o campo "Motivador principal" da tela. */
  listarAtivos(): Promise<Motivo[]> {
    return this.repositorio.find({ where: { ativo: true }, order: { ordem: 'ASC' } });
  }

  async buscarPorId(id: string): Promise<Motivo> {
    const motivo = await this.repositorio.findOne({ where: { id }, withDeleted: true });
    if (!motivo) throw new NotFoundException(`Motivador ${id} não encontrado`);
    return motivo;
  }

  async criar(dto: CriarMotivoDto, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria) {
    if (await this.repositorio.countBy({ codigo: dto.codigo })) {
      throw new ConflictException(`Já existe um motivador com o código ${dto.codigo}`);
    }

    const motivo = await this.repositorio.save(this.repositorio.create(dto));

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.MOTIVO_CRIADO,
      operacao: OperacaoAuditoria.INSERT,
      entidade: 'MOTIVO',
      entidadeId: motivo.id,
      usuario,
      detalhes: { codigo: motivo.codigo, descricao: motivo.descricao },
      contexto,
    });

    return motivo;
  }

  async atualizar(
    id: string,
    dto: AtualizarMotivoDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ) {
    const motivo = await this.buscarPorId(id);
    const anterior = { ...motivo };

    Object.assign(motivo, dto);
    await this.repositorio.save(motivo);

    await this.auditoriaService.registrarAlteracoes(
      {
        acao: AcaoAuditoria.MOTIVO_ALTERADO,
        operacao: OperacaoAuditoria.UPDATE,
        entidade: 'MOTIVO',
        entidadeId: id,
        usuario,
        contexto,
      },
      anterior as unknown as Record<string, unknown>,
      dto as unknown as Record<string, unknown>,
    );

    return motivo;
  }

  /** Remoção lógica — o histórico continua referenciando o motivador. */
  async remover(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<void> {
    const motivo = await this.buscarPorId(id);
    await this.repositorio.softDelete({ id });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.MOTIVO_REMOVIDO,
      operacao: OperacaoAuditoria.SOFT_DELETE,
      entidade: 'MOTIVO',
      entidadeId: id,
      usuario,
      detalhes: { codigo: motivo.codigo, descricao: motivo.descricao },
      contexto,
    });
  }

  async restaurar(id: string, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria) {
    await this.repositorio.restore({ id });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.MOTIVO_ALTERADO,
      operacao: OperacaoAuditoria.RESTORE,
      entidade: 'MOTIVO',
      entidadeId: id,
      usuario,
      contexto,
    });

    return this.buscarPorId(id);
  }
}
