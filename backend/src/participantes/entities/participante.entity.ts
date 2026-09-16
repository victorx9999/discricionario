import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { transformadorNumerico } from '../../common/utils';
import { Comite } from '../../comites/entities/comite.entity';
import { Motivo } from '../../motivos/entities/motivo.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Acrescimo } from './acrescimo.entity';

/**
 * Participante — um registro da base TBPR_Simuladores dentro de um ciclo.
 *
 * A chave natural é (ciclo, EMPLID): o mesmo colaborador existe uma vez por
 * ano, com seus próprios valores e sua própria decisão de comitê. É isso que
 * mantém 2026 intacto quando 2027 é carregado.
 *
 * Os campos de decisão do comitê (`fd`, `notaDiscricionario`,
 * `motivoDiscricionario`, `observacaoPoscomite`, `codMotivador`) vivem aqui,
 * como na documentação, e são preservados na carga parcial.
 */
@Entity('participantes')
@Unique('uq_participante_ciclo_emplid', ['cicloId', 'emplid'])
@Index('idx_participantes_nome', ['nome'])
@Index('idx_participantes_nivel', ['xlatlongname'])
@Index('idx_participantes_modelo', ['modeloAvaliacao'])
@Index('idx_participantes_area', ['area'])
export class Participante {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ------------------------------------------------------------------
  // Ciclo e vínculo
  // ------------------------------------------------------------------

  @ManyToOne(() => Ciclo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo: Ciclo;

  @Index('idx_participantes_ciclo')
  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId: string;

  /** Comitê ao qual o participante está vinculado. Um participante, um comitê. */
  @ManyToOne(() => Comite, (comite) => comite.participantes, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'comite_id' })
  comite: Comite | null;

  @Index('idx_participantes_comite')
  @Column({ name: 'comite_id', type: 'uuid', nullable: true })
  comiteId: string | null;

  // ------------------------------------------------------------------
  // Identificação (TBPR_Simuladores)
  // ------------------------------------------------------------------

  @Column({ name: 'national_id', length: 30, nullable: true })
  nationalId: string | null;

  /** EMPLID — funcional do colaborador, chave de identificação. */
  @Index('idx_participantes_emplid')
  @Column({ length: 30 })
  emplid: string;

  /** NAME */
  @Column({ length: 200 })
  nome: string;

  @Column({ name: 'dtuflpg', type: 'date', nullable: true })
  dtUltimaFolha: Date | null;

  @Column({ name: 'last_hire_dt', type: 'date', nullable: true })
  dataAdmissao: Date | null;

  @Column({ length: 20, nullable: true })
  company: string | null;

  @Column({ name: 'descr_company', length: 150, nullable: true })
  descrCompany: string | null;

  @Column({ length: 30, nullable: true })
  jobcode: string | null;

  @Column({ name: 'descr_jobcode', length: 150, nullable: true })
  descrJobcode: string | null;

  /** MANAGER_LEVEL — 30=Superintendente, 35=Gerente, 40=Coordenador... */
  @Column({ name: 'manager_level', type: 'int', nullable: true })
  managerLevel: number | null;

  /** XLATLONGNAME — nível do cargo por extenso. É o eixo do resumo por nível. */
  @Column({ length: 80, nullable: true })
  xlatlongname: string | null;

  @Column({ length: 30, nullable: true })
  deptid: string | null;

  @Column({ name: 'descr_deptid', length: 150, nullable: true })
  descrDeptid: string | null;

  @Column({ length: 150, nullable: true })
  area: string | null;

  @Column({ name: 'area_origem', length: 150, nullable: true })
  areaOrigem: string | null;

  @Column({ length: 30, nullable: true })
  idsubmodelo: string | null;

  @Column({ name: 'descricao_submodelo', length: 150, nullable: true })
  descricaoSubmodelo: string | null;

  // ------------------------------------------------------------------
  // Valores e fatores
  // ------------------------------------------------------------------

  @Column({
    name: 'valorbase',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  valorBase: number;

  /** VLBASEMES — peso da performance ponderada por VB. */
  @Column({
    name: 'vlbasemes',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlBaseMes: number;

  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0, transformer: transformadorNumerico })
  elegivel: number;

  @Column({
    name: 'eleg_total',
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 0,
    transformer: transformadorNumerico,
  })
  elegTotal: number;

  /** FPBA — fator de performance da base de avaliação. */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fpba: number;

  /** NOTA — nota de performance antes do discricionário. */
  @Column({ type: 'numeric', precision: 12, scale: 4, default: 0, transformer: transformadorNumerico })
  nota: number;

  /** FPI — fator de performance individual (pré-discricionário). */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fpi: number;

  /** FD — fator discricionário, decisão do comitê. */
  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: transformadorNumerico })
  fd: number;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0, transformer: transformadorNumerico })
  calc1: number;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0, transformer: transformadorNumerico })
  calc2: number;

  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0, transformer: transformadorNumerico })
  calc3: number;

  /** CALC4 — base do PR. VL_PR_I = CALC4 × FPI e VL_PR_F = CALC4 × FPI_FINAL. */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0, transformer: transformadorNumerico })
  calc4: number;

  /** GRUPO_RANKING — "código - nome" do comitê ao qual o colaborador pertence. */
  @Index('idx_participantes_grupo_ranking')
  @Column({ name: 'grupo_ranking', length: 150, nullable: true })
  grupoRanking: string | null;

  @Column({ length: 60, nullable: true })
  idpool: string | null;

  @Column({ length: 60, nullable: true })
  idcurva: string | null;

  @Column({
    name: 'vb_ano_anterior',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vbAnoAnterior: number;

  @Column({
    name: 'pr_ano_anterior1',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  prAnoAnterior1: number;

  /** PR do ano anterior usado nos comparativos {A} x {P}. */
  @Column({
    name: 'pr_ano_anterior2',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  prAnoAnterior2: number;

  @Column({
    name: 'pr_ano_anterior3',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  prAnoAnterior3: number;

  @Column({
    name: 'total_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  totalCash: number;

  @Column({
    name: 'total_cash_ano_anterior1',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  totalCashAnoAnterior1: number;

  @Column({
    name: 'total_cash_ano_anterior2',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  totalCashAnoAnterior2: number;

  @Column({
    name: 'total_cash_ano_anterior3',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  totalCashAnoAnterior3: number;

  /** VL_PR_I — PR inicial (sem discricionário). */
  @Column({
    name: 'vl_pr_i',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlPrI: number;

  /** VL_PR_F — PR final (pós discricionário). Recalculado a cada alteração de FD. */
  @Column({
    name: 'vl_pr_f',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlPrF: number;

  /** VLR_TEORICO — base do cálculo do pool. */
  @Column({
    name: 'vlr_teorico',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: transformadorNumerico,
  })
  vlrTeorico: number;

  @Column({
    name: 'nota_ano_anterior',
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 0,
    transformer: transformadorNumerico,
  })
  notaAnoAnterior: number;

  /** MODELO_AVALIACAO — Institucional ou Comunidade. */
  @Column({ name: 'modelo_avaliacao', length: 40, nullable: true })
  modeloAvaliacao: string | null;

  @Column({ name: 'flag_comunidade', length: 20, nullable: true })
  flagComunidade: string | null;

  @Column({ name: 'area_grupo', length: 60, nullable: true })
  areaGrupo: string | null;

  @Column({ name: 'nome_grupo', length: 150, nullable: true })
  nomeGrupo: string | null;

  @Column({ name: 'status_contrato', length: 60, nullable: true })
  statusContrato: string | null;

  /** SOCIO_{ano-1} */
  @Column({ name: 'socio_ano_anterior', default: false })
  socioAnoAnterior: boolean;

  /** SOCIO_{ano} */
  @Column({ name: 'socio_ano', default: false })
  socioAno: boolean;

  // ------------------------------------------------------------------
  // Curva de interpolação da nota (P1..P5 -> N1..N5)
  // ------------------------------------------------------------------

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: transformadorNumerico })
  p1: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: transformadorNumerico })
  p2: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: transformadorNumerico })
  p3: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: transformadorNumerico })
  p4: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: transformadorNumerico })
  p5: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: transformadorNumerico })
  n1: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: transformadorNumerico })
  n2: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: transformadorNumerico })
  n3: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: transformadorNumerico })
  n4: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true, transformer: transformadorNumerico })
  n5: number | null;

  // ------------------------------------------------------------------
  // Decisão do comitê (preservada na carga parcial)
  // ------------------------------------------------------------------

  /** NOTA_DISCRICIONARIO — nota interpolada a partir do FPI_FINAL. */
  @Column({
    name: 'nota_discricionario',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
    transformer: transformadorNumerico,
  })
  notaDiscricionario: number | null;

  @ManyToOne(() => Motivo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'motivo_id' })
  motivo: Motivo | null;

  @Column({ name: 'motivo_id', type: 'uuid', nullable: true })
  motivoId: string | null;

  /** COD_MOTIVADOR — código do motivador, como na base. */
  @Column({ name: 'cod_motivador', type: 'int', nullable: true })
  codMotivador: number | null;

  /** MOTIVO_DISCRICIONARIO — descrição do motivador no momento do lançamento. */
  @Column({ name: 'motivo_discricionario', length: 200, nullable: true })
  motivoDiscricionario: string | null;

  /** OBSERVACAO_POSCOMITE — justificativa detalhada. */
  @Column({ name: 'observacao_poscomite', type: 'text', nullable: true })
  observacaoPoscomite: string | null;

  /** Marca lançamentos que ultrapassaram o limite e foram confirmados. */
  @Column({ name: 'fd_fora_limite', default: false })
  fdForaLimite: boolean;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lancado_por_id' })
  lancadoPor: Usuario | null;

  @Column({ name: 'lancado_por_id', type: 'uuid', nullable: true })
  lancadoPorId: string | null;

  @Column({ name: 'lancado_em', type: 'timestamptz', nullable: true })
  lancadoEm: Date | null;

  // ------------------------------------------------------------------
  // Relacionamentos e controle
  // ------------------------------------------------------------------

  @OneToMany(() => Acrescimo, (acrescimo) => acrescimo.participante)
  acrescimos: Acrescimo[];

  @Column({ name: 'importacao_id', type: 'uuid', nullable: true })
  importacaoId: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;

  /** Tem discricionário lançado? */
  get temDiscricionario(): boolean {
    return Number(this.fd) !== 0;
  }

  /** Pendência que impede a conclusão do comitê (seção 3.7). */
  get pendente(): boolean {
    return this.temDiscricionario && (!this.codMotivador || !this.observacaoPoscomite?.trim());
  }
}
