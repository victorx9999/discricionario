import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AcaoAuditoria, OperacaoAuditoria, OrigemAuditoria } from '../../common/enums';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';

/**
 * Trilha de auditoria (AuditLog).
 *
 * Append-only: nenhum serviço faz UPDATE ou DELETE aqui. O usuário é
 * referenciado por FK (ON DELETE SET NULL) e também gravado de forma
 * desnormalizada (`usuario_email`) para que o log continue legível caso o
 * usuário seja removido. O `ciclo_id` mantém a trilha separada por ano.
 */
@Entity('auditoria_logs')
@Index('idx_auditoria_criado_em', ['criadoEm'])
@Index('idx_auditoria_acao', ['acao'])
@Index('idx_auditoria_entidade', ['entidade', 'entidadeId'])
export class LogAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AcaoAuditoria, enumName: 'acao_auditoria_enum' })
  acao: AcaoAuditoria;

  @Column({
    type: 'enum',
    enum: OperacaoAuditoria,
    enumName: 'operacao_auditoria_enum',
    default: OperacaoAuditoria.UPDATE,
  })
  operacao: OperacaoAuditoria;

  /** Nome lógico da entidade afetada (PARTICIPANTE, COMITE, CICLO, ...). */
  @Column({ length: 60 })
  entidade: string;

  @Column({ name: 'entidade_id', length: 100, nullable: true })
  entidadeId: string | null;

  @ManyToOne(() => Ciclo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo: Ciclo | null;

  @Index('idx_auditoria_ciclo')
  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true })
  cicloId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @Index('idx_auditoria_usuario')
  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @Column({ name: 'usuario_email', length: 150, nullable: true })
  usuarioEmail: string | null;

  @Index('idx_auditoria_comite')
  @Column({ name: 'comite_id', type: 'uuid', nullable: true })
  comiteId: string | null;

  @Index('idx_auditoria_participante')
  @Column({ name: 'participante_id', type: 'uuid', nullable: true })
  participanteId: string | null;

  @Column({ name: 'campo_alterado', length: 80, nullable: true })
  campoAlterado: string | null;

  @Column({ name: 'valor_anterior', type: 'text', nullable: true })
  valorAnterior: string | null;

  @Column({ name: 'valor_novo', type: 'text', nullable: true })
  valorNovo: string | null;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detalhes: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: OrigemAuditoria,
    enumName: 'origem_auditoria_enum',
    default: OrigemAuditoria.BACKEND,
  })
  origem: OrigemAuditoria;

  @Column({ length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', length: 300, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
