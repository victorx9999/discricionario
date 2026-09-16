import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatusCiclo } from '../../common/enums';
import { transformadorNumerico } from '../../common/utils';

/**
 * Ciclo (ano-base) do discricionário.
 *
 * É a raiz do histórico: participantes, acréscimos, comitês, ATAs, lançamentos
 * e importações pertencem a um ciclo. A carga completa (truncate) opera
 * **apenas dentro do ciclo alvo**, então rodar 2027 nunca apaga 2026.
 *
 * O ciclo também guarda as premissas vigentes (seção 10), versionadas por ano:
 * ao mudar o percentual do pool ou o limite do FD em 2027, o histórico de 2026
 * continua consultável com os parâmetros que valiam à época.
 */
@Entity('ciclos')
export class Ciclo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_ciclos_ano', { unique: true })
  @Column({ type: 'int', unique: true })
  ano: number;

  @Column({ length: 120, nullable: true })
  descricao: string | null;

  @Column({ type: 'enum', enum: StatusCiclo, enumName: 'status_ciclo_enum', default: StatusCiclo.ABERTO })
  status: StatusCiclo;

  /** Apenas um ciclo fica ativo — é o default de todos os endpoints. */
  @Column({ default: false })
  ativo: boolean;

  // ------------------------------------------------------------------
  // Premissas vigentes (seção 10)
  // ------------------------------------------------------------------

  /** Percentual do VLR_TEORICO que forma o pool. Padrão 1%. */
  @Column({
    name: 'percentual_pool',
    type: 'numeric',
    precision: 8,
    scale: 6,
    default: 0.01,
    transformer: transformadorNumerico,
  })
  percentualPool: number;

  /** Limite do FD em pontos percentuais decimais. Padrão 0,15 (±15pp). */
  @Column({
    name: 'limite_fd',
    type: 'numeric',
    precision: 8,
    scale: 6,
    default: 0.15,
    transformer: transformadorNumerico,
  })
  limiteFd: number;

  /**
   * Quando `true`, um lançamento que estoure o pool é recusado (422).
   * Quando `false`, segue o comportamento da documentação: o lançamento é
   * aceito e sinalizado, e a confirmação é exigida ao concluir o comitê.
   */
  @Column({ name: 'bloquear_pool_excedido', default: true })
  bloquearPoolExcedido: boolean;

  /** HC Máx. = arredondar para cima (HC Total ÷ divisor). Padrão 3 (1/3 do HC). */
  @Column({ name: 'divisor_hc_max', type: 'int', default: 3 })
  divisorHcMax: number;

  /** Fator PEP aplicado a sócios no Total Cash. Padrão 0,725. */
  @Column({
    name: 'fator_pep',
    type: 'numeric',
    precision: 8,
    scale: 6,
    default: 0.725,
    transformer: transformadorNumerico,
  })
  fatorPep: number;

  /** Fator de diferimento de sócios. Padrão 0,70. */
  @Column({
    name: 'fator_diferimento',
    type: 'numeric',
    precision: 8,
    scale: 6,
    default: 0.7,
    transformer: transformadorNumerico,
  })
  fatorDiferimento: number;

  /** Tipo de simulador considerado na performance ponderada. Padrão "Institucional". */
  @Column({ name: 'tipo_simulador_performance', length: 40, default: 'Institucional' })
  tipoSimuladorPerformance: string;

  /** Exige motivador e justificativa em todo discricionário. */
  @Column({ name: 'motivo_obrigatorio', default: true })
  motivoObrigatorio: boolean;

  /** Exige ATA completa para concluir o comitê. */
  @Column({ name: 'ata_obrigatoria', default: true })
  ataObrigatoria: boolean;

  @Column({ name: 'fechado_em', type: 'timestamptz', nullable: true })
  fechadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;

  /** Rótulo do comparativo com o ano anterior (ex.: "25/26"). */
  get rotuloComparativo(): string {
    return `${String(this.ano - 1).slice(-2)}/${String(this.ano).slice(-2)}`;
  }
}
