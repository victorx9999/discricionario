import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { StatusAnalise } from '../../common/enums';
import { Discricionario } from '../../discricionario/entities/discricionario.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Comite } from './comite.entity';

/**
 * Análise de um participante dentro de um comitê.
 *
 * É o elo da cadeia Grupo -> Participantes -> Comitê -> Análise -> Discricionário.
 * A `ordem` define a navegação (primeiro / anterior / próximo / último).
 */
@Entity('analises_participante')
@Unique('uq_analise_comite_participante', ['comiteId', 'participanteId'])
@Index('idx_analises_comite_ordem', ['comiteId', 'ordem'])
export class AnaliseParticipante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Comite, (comite) => comite.analises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comite_id' })
  comite: Comite;

  @Column({ name: 'comite_id', type: 'uuid' })
  comiteId: string;

  @ManyToOne(() => Participante, (participante) => participante.analises, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participante_id' })
  participante: Participante;

  @Column({ name: 'participante_id', type: 'uuid' })
  participanteId: string;

  /** Posição do participante na navegação do comitê (base 1). */
  @Column({ type: 'int', default: 1 })
  ordem: number;

  @Column({
    type: 'enum',
    enum: StatusAnalise,
    enumName: 'status_analise_enum',
    default: StatusAnalise.PENDENTE,
  })
  status: StatusAnalise;

  @OneToOne(() => Discricionario, (discricionario) => discricionario.analise)
  discricionario: Discricionario | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'analisado_por_id' })
  analisadoPor: Usuario | null;

  @Column({ name: 'analisado_por_id', type: 'uuid', nullable: true })
  analisadoPorId: string | null;

  @Column({ name: 'analisado_em', type: 'timestamptz', nullable: true })
  analisadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
