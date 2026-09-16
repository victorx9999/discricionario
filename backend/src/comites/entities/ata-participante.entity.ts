import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Ata } from './ata.entity';

/** Presente registrado na ATA do comitê. */
@Entity('ata_participantes')
export class AtaParticipante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ata, (ata) => ata.participantes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ata_id' })
  ata: Ata;

  @Index('idx_ata_participantes_ata')
  @Column({ name: 'ata_id', type: 'uuid' })
  ataId: string;

  @Column({ length: 150 })
  nome: string;

  @Column({ length: 120, nullable: true })
  papel: string | null;

  /** Quando o presente é um usuário do sistema. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
