import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorNumerico } from '../../common/utils';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { Grupo } from '../../grupos/entities/grupo.entity';
import { AcrescimoParticipante } from './acrescimo-participante.entity';

/**
 * Participante — origem: base principal.
 *
 * Todos os campos usados em cálculo, filtro ou agrupamento são colunas
 * tipadas (`numeric` / `varchar`). Novas colunas da base entram por migration
 * dedicada, sem impacto na arquitetura: o mapeamento CSV -> coluna fica
 * centralizado em `uploads/services/mapeamento-base-principal.ts`.
 */
@Entity('participantes')
@Index('idx_participantes_nome', ['nome'])
@Index('idx_participantes_nivel_cargo', ['nivelCargo'])
@Index('idx_participantes_area', ['area'])
@Index('idx_participantes_modelo_avaliacao', ['modeloAvaliacao'])
export class Participante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Matrícula/identificador funcional — chave natural vinda da base. */
  @Index('idx_participantes_funcional', { unique: true })
  @Column({ length: 30, unique: true })
  funcional: string;

  @Column({ length: 200 })
  nome: string;

  @Column({ length: 150, nullable: true })
  cargo: string | null;

  @Column({ name: 'nivel_cargo', length: 80, nullable: true })
  nivelCargo: string | null;

  /** Modelo de avaliação aplicado ao participante (vindo da base). */
  @Column({ name: 'modelo_avaliacao', length: 80, nullable: true })
  modeloAvaliacao: string | null;

  /** Área atual — é a área considerada para o pool. */
  @Column({ length: 150, nullable: true })
  area: string | null;

  /** Área de origem, quando o participante mudou de área no período. */
  @Column({ name: 'area_origem', length: 150, nullable: true })
  areaOrigem: string | null;

  // ------------------------------------------------------------------
  // Fatores
  // ------------------------------------------------------------------

  /** Fator de performance individual inicial. */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fpi: number;

  /** FPI já com o efeito do FD aplicado (FPI_FINAL = FPI + FD). */
  @Column({
    name: 'fpi_final',
    type: 'numeric',
    precision: 12,
    scale: 6,
    default: 0,
    transformer: transformadorNumerico,
  })
  fpiFinal: number;

  /** Fator base de participação anual. */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fbpa: number;

  /** Fator discricionário consolidado do participante (-0.15 a 0.15). */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fd: number;

  // ------------------------------------------------------------------
  // Valores
  // ------------------------------------------------------------------

  @Column({
    name: 'valor_base',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorBase: number;

  /** PR inicial = VALORBASE x FBPA x FPI (sem acréscimo). */
  @Column({
    name: 'valor_pr_i',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorPrI: number;

  /** PR final = VALORBASE x FBPA x FPI_FINAL (sem acréscimo). */
  @Column({
    name: 'valor_pr_f',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorPrF: number;

  /** Valor teórico — base de cálculo do pool do grupo. */
  @Column({
    name: 'vlr_teorico',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlrTeorico: number;

  @Column({ default: true })
  ativo: boolean;

  /** Importação que criou/atualizou o registro pela última vez. */
  @Column({ name: 'importacao_id', type: 'uuid', nullable: true })
  importacaoId: string | null;

  // ------------------------------------------------------------------
  // Relacionamentos
  // ------------------------------------------------------------------

  @OneToMany(() => AcrescimoParticipante, (acrescimo) => acrescimo.participante, { cascade: false })
  acrescimos: AcrescimoParticipante[];

  @ManyToMany(() => Grupo, (grupo) => grupo.participantes)
  grupos: Grupo[];

  @OneToMany(() => AnaliseParticipante, (analise) => analise.participante)
  analises: AnaliseParticipante[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
