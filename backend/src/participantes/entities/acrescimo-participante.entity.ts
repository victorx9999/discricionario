import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorNumerico } from '../../common/utils';
import { Participante } from './participante.entity';

/**
 * Acréscimo — origem: base de acréscimo.
 *
 * Guarda os complementos de PR de participantes que passaram por mais de uma
 * área no período. O pool continua sendo calculado sobre o VLRTEORICO da área
 * atual; o acréscimo entra apenas na visão anual (VL_PR_I / VL_PR_F exibidos
 * no comitê).
 */
@Entity('acrescimos_participante')
@Unique('uq_acrescimo_participante_area', ['participanteId', 'areaOrigem'])
export class AcrescimoParticipante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Participante, (participante) => participante.acrescimos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participante_id' })
  participante: Participante;

  @Index('idx_acrescimos_participante')
  @Column({ name: 'participante_id', type: 'uuid' })
  participanteId: string;

  /** Área pela qual o participante passou e que gerou o acréscimo. */
  @Column({ name: 'area_origem', length: 150 })
  areaOrigem: string;

  @Column({
    name: 'valor_acrescimo_pr_i',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorAcrescimoPrI: number;

  @Column({
    name: 'valor_acrescimo_pr_f',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorAcrescimoPrF: number;

  @Column({ length: 300, nullable: true })
  observacao: string | null;

  @Column({ name: 'importacao_id', type: 'uuid', nullable: true })
  importacaoId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
