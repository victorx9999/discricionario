import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { transformadorNumerico } from '../../common/utils';
import { Participante } from './participante.entity';

/**
 * Acréscimo — uma linha da base TBPR_Simuladores_Acres.
 *
 * Colaboradores transferidos ganham uma linha adicional por área. O acréscimo
 * é aplicado **apenas quando** `FLAG_CALCULAR_POOL = true`,
 * `TIPO_SIMULADOR = "Institucional"` e `IDPOOL = "Dentro de Pool"`; o
 * casamento é por EMPLID, já que o GRUPO_RANKING pode vir vazio aqui — o
 * grupo já está definido na base principal.
 *
 * Efeitos quando elegível:
 *  - `vlrTeorico` soma ao pool do comitê;
 *  - `vlPrI` soma ao PR sem discricionário;
 *  - o PR pós discricionário do acréscimo é recalculado com o **mesmo FD do
 *    titular**, a partir de `calc4` e `fpi` próprios.
 */
@Entity('acrescimos')
@Index('idx_acrescimos_emplid', ['cicloId', 'emplid'])
export class Acrescimo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ciclo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo: Ciclo;

  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId: string;

  /** Casamento por EMPLID com a base principal. */
  @Column({ length: 30 })
  emplid: string;

  @ManyToOne(() => Participante, (participante) => participante.acrescimos, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'participante_id' })
  participante: Participante | null;

  @Index('idx_acrescimos_participante')
  @Column({ name: 'participante_id', type: 'uuid', nullable: true })
  participanteId: string | null;

  /** FLAG_CALCULAR_POOL — se falso, o acréscimo é ignorado nos cálculos. */
  @Column({ name: 'flag_calcular_pool', default: false })
  flagCalcularPool: boolean;

  /** TIPO_SIMULADOR — precisa ser "Institucional" para elegibilidade. */
  @Column({ name: 'tipo_simulador', length: 40, nullable: true })
  tipoSimulador: string | null;

  /** IDPOOL — precisa ser "Dentro de Pool" para elegibilidade. */
  @Column({ length: 60, nullable: true })
  idpool: string | null;

  /** Pode vir vazio — não é usado como chave. */
  @Column({ name: 'grupo_ranking', length: 150, nullable: true })
  grupoRanking: string | null;

  /** VLR_TEORICO adicional — soma ao pool do comitê. */
  @Column({
    name: 'vlr_teorico',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlrTeorico: number;

  /**
   * VL_PR_I do acréscimo — soma ao PR sem discricionário.
   * Quando ausente no arquivo, o `VLR_TEORICO` é usado como valor do acréscimo.
   */
  @Column({
    name: 'vl_pr_i',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlPrI: number;

  /** CALC4 do acréscimo — base para recalcular o PR pós com o FD do titular. */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0, transformer: transformadorNumerico })
  calc4: number;

  /** FPI do acréscimo — divisor do recálculo. */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fpi: number;

  @Column({ length: 150, nullable: true })
  area: string | null;

  @Column({ name: 'importacao_id', type: 'uuid', nullable: true })
  importacaoId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;

  /** Regra de elegibilidade da seção 3.5 / 4.2. */
  get elegivel(): boolean {
    return (
      this.flagCalcularPool === true &&
      (this.tipoSimulador ?? '').trim().toLowerCase() === 'institucional' &&
      (this.idpool ?? '').trim().toLowerCase() === 'dentro de pool'
    );
  }
}
