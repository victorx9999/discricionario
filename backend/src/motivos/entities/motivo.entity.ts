import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorNumerico } from '../../common/utils';

/**
 * Catálogo de motivadores do discricionário (COD_MOTIVADOR).
 *
 * É uma tabela de domínio com CRUD completo — novos motivadores entram por
 * cadastro, sem migration nem deploy. Cada motivador pode ter um limite
 * próprio de impacto: é assim que "SQV (com impacto limitado a ±5pp)" fica
 * configurado, em vez de codificado.
 */
@Entity('motivos')
export class Motivo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** COD_MOTIVADOR — código numérico usado na base. */
  @Index('idx_motivos_codigo', { unique: true })
  @Column({ type: 'int', unique: true })
  codigo: number;

  @Column({ length: 200 })
  descricao: string;

  @Column({ length: 400, nullable: true })
  detalhe: string | null;

  /**
   * Limite de FD específico deste motivador, em decimal (0.05 = 5pp).
   * Quando nulo, vale o limite do ciclo (±0,15).
   */
  @Column({
    name: 'limite_fd',
    type: 'numeric',
    precision: 8,
    scale: 6,
    nullable: true,
    transformer: transformadorNumerico,
  })
  limiteFd: number | null;

  /** Exige justificativa detalhada além do motivador. */
  @Column({ name: 'exige_justificativa', default: true })
  exigeJustificativa: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;
}

/**
 * Motivadores conhecidos hoje, conforme a tela de avaliação discricionária.
 * Seedados na migration; podem ser editados/ampliados pelo Admin.
 */
export const MOTIVOS_PADRAO = [
  {
    codigo: 1,
    descricao: 'Performance com justificativa detalhada',
    detalhe: 'Ajuste por performance individual, com justificativa detalhada obrigatória.',
    limiteFd: null,
    ordem: 1,
  },
  {
    codigo: 2,
    descricao: 'Indicadores de avaliação comportamental',
    detalhe: 'Ajuste fundamentado nos indicadores de avaliação comportamental.',
    limiteFd: null,
    ordem: 2,
  },
  {
    codigo: 3,
    descricao: 'SQV (com impacto limitado a +/- 5pp)',
    detalhe: 'Ajuste por SQV. O impacto é limitado a ±5 pontos percentuais.',
    limiteFd: 0.05,
    ordem: 3,
  },
  {
    codigo: 4,
    descricao: 'Todos',
    detalhe: 'Combinação dos motivadores acima.',
    limiteFd: null,
    ordem: 4,
  },
] as const;
