import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { ContextoAuditoria } from '../../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../../auth/decorators';
import { AcaoAuditoria, OperacaoAuditoria } from '../../common/enums';
import { SalvarAtaDto } from '../dto';
import { Ata } from '../entities/ata.entity';
import { AtaParticipante } from '../entities/ata-participante.entity';
import { Comite } from '../entities/comite.entity';

/**
 * ATA do comitê — registro formal com data, horário e participantes.
 * É criada sob demanda (1:1 com o comitê) e exigida para concluí-lo.
 */
@Injectable()
export class AtasService {
  constructor(
    @InjectRepository(Ata) private readonly atas: Repository<Ata>,
    private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async buscarPorComite(comiteId: string): Promise<Ata | null> {
    return this.atas.findOne({ where: { comiteId }, relations: { participantes: true } });
  }

  /** Cria ou atualiza a ATA do comitê, substituindo a lista de presentes. */
  async salvar(
    comite: Comite,
    dto: SalvarAtaDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<Ata> {
    const existente = await this.buscarPorComite(comite.id);

    const ata = await this.dataSource.transaction(async (manager) => {
      const entidade =
        existente ??
        manager.create(Ata, { comiteId: comite.id, participantes: [] as AtaParticipante[] });

      if (dto.data !== undefined) entidade.data = dto.data;
      if (dto.horaInicio !== undefined) entidade.horaInicio = dto.horaInicio;
      if (dto.horaFim !== undefined) entidade.horaFim = dto.horaFim;
      if (dto.observacoes !== undefined) entidade.observacoes = dto.observacoes;
      if (dto.anexos !== undefined) entidade.anexos = dto.anexos;

      const salva = await manager.save(Ata, entidade);

      if (dto.participantes !== undefined) {
        await manager.delete(AtaParticipante, { ataId: salva.id });
        if (dto.participantes.length) {
          await manager.insert(
            AtaParticipante,
            dto.participantes.map((participante) => ({
              ataId: salva.id,
              nome: participante.nome,
              papel: participante.papel ?? null,
              usuarioId: participante.usuarioId ?? null,
            })),
          );
        }
      }

      return salva;
    });

    await this.auditoriaService.registrar({
      acao: existente ? AcaoAuditoria.ATA_ALTERADA : AcaoAuditoria.ATA_CADASTRADA,
      operacao: existente ? OperacaoAuditoria.UPDATE : OperacaoAuditoria.INSERT,
      entidade: 'ATA',
      entidadeId: ata.id,
      cicloId: comite.cicloId,
      comiteId: comite.id,
      usuario,
      detalhes: {
        data: dto.data,
        horaInicio: dto.horaInicio,
        horaFim: dto.horaFim,
        participantes: dto.participantes?.length ?? null,
      },
      contexto,
    });

    const completa = await this.buscarPorComite(comite.id);
    if (!completa) throw new NotFoundException('ATA não encontrada após o salvamento');
    return completa;
  }
}
