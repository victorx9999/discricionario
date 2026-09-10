import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorNumerico } from '../../common/utils';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { AvaliacaoComportamental } from './avaliacao-comportamental.entity';

/**
 * Discricionário atribuído a um participante dentro de um comitê.
 *
 * Existe no máximo um discricionário por análise (1:1). Os campos `*Calculado`
 * são snapshots do resultado das fórmulas no momento do salvamento — o
 * frontend apenas exibe, todo cálculo acontece no `CalculoService`.
 */
@Entity('discricionarios')
export class Discricionario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => AnaliseParticipante, (analise) => analise.discricionario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'analise_id' })
  analise: AnaliseParticipante;

  @Index('idx_discricionarios_analise', { unique: true })
  @Column({ name: 'analise_id', type: 'uuid' })
  analiseId: string;

  /**
   * Valor do FD, em pontos percentuais decimais.
   * Positivo, negativo ou zero — limitado a ±0,15 (±15pp).
   */
  @Column({
    name: 'valor_fd',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorFd: number;

  @ManyToOne(() => AvaliacaoComportamental, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'avaliacao_comportamental_id' })
  avaliacaoComportamental: AvaliacaoComportamental | null;

  @Column({ name: 'avaliacao_comportamental_id', type: 'uuid', nullable: true })
  avaliacaoComportamentalId: string | null;

  @Column({ type: 'text', nullable: true })
  justificativa: string | null;

  // ------------------------------------------------------------------
  // Snapshots calculados
  // ------------------------------------------------------------------

  @Column({
    name: 'fpi_final_calculado',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
    transformer: transformadorNumerico,
  })
  fpiFinalCalculado: number;

  @Column({
    name: 'valor_pr_i_calculado',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorPrICalculado: number;

  @Column({
    name: 'valor_pr_f_calculado',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorPrFCalculado: number;

  /** PR final - PR inicial. Positivo consome pool; negativo devolve. */
  @Column({
    name: 'impacto_financeiro',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  impactoFinanceiro: number;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor: Usuario | null;

  @Column({ name: 'criado_por_id', type: 'uuid', nullable: true })
  criadoPorId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'atualizado_por_id' })
  atualizadoPor: Usuario | null;

  @Column({ name: 'atualizado_por_id', type: 'uuid', nullable: true })
  atualizadoPorId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
