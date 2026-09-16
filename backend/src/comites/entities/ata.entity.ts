import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Comite } from './comite.entity';
import { AtaParticipante } from './ata-participante.entity';

/**
 * ATA do comitê — registro formal com data, horário e participantes.
 *
 * É 1:1 com o comitê e obrigatória para concluí-lo: sem data, hora de início,
 * hora de fim e ao menos um participante, a conclusão é bloqueada (seção 3.7).
 */
@Entity('atas')
export class Ata {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Comite, (comite) => comite.ata, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comite_id' })
  comite: Comite;

  @Index('idx_atas_comite', { unique: true })
  @Column({ name: 'comite_id', type: 'uuid' })
  comiteId: string;

  /** Data única da reunião. */
  @Column({ type: 'date', nullable: true })
  data: string | null;

  @Column({ name: 'hora_inicio', type: 'time', nullable: true })
  horaInicio: string | null;

  @Column({ name: 'hora_fim', type: 'time', nullable: true })
  horaFim: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  /** Anexos: [{ nome, url, tamanho }]. */
  @Column({ type: 'jsonb', nullable: true })
  anexos: Array<Record<string, unknown>> | null;

  @OneToMany(() => AtaParticipante, (participante) => participante.ata, { cascade: true })
  participantes: AtaParticipante[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;
}
