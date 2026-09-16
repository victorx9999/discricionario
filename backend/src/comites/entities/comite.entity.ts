import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { StatusComite, TipoComite } from '../../common/enums';
import { Participante } from '../../participantes/entities/participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Ata } from './ata.entity';
import { ComiteColuna } from './comite-coluna.entity';
import { ComiteResponsavel } from './comite-responsavel.entity';

/**
 * Comitê — o GRUPO_RANKING da base.
 *
 * Na documentação, grupo e comitê são a mesma entidade: o identificador vem no
 * formato "código - nome" (ex.: `100702 - WMS PRIVATE`). Um comitê pertence a
 * um ciclo; o mesmo código pode existir em 2026 e em 2027 como comitês
 * distintos, cada um com seus participantes, sua ATA e seus lançamentos.
 */
@Entity('comites')
@Unique('uq_comite_ciclo_codigo', ['cicloId', 'codigo'])
@Index('idx_comites_nome', ['nome'])
export class Comite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ciclo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo: Ciclo;

  @Index('idx_comites_ciclo')
  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId: string;

  /** Código do grupo (ex.: `100702`). */
  @Column({ length: 50 })
  codigo: string;

  /** Nome do grupo (ex.: `WMS PRIVATE`). */
  @Column({ length: 150 })
  nome: string;

  /** GRUPO_RANKING completo — "código - nome". */
  @Index('idx_comites_grupo_ranking')
  @Column({ name: 'grupo_ranking', length: 200 })
  grupoRanking: string;

  @Column({ length: 150, nullable: true })
  area: string | null;

  /** Composição de modelos (Institucional, Comunidade ou Misto). */
  @Column({ type: 'enum', enum: TipoComite, enumName: 'tipo_comite_enum', default: TipoComite.MISTO })
  tipo: TipoComite;

  @Column({
    type: 'enum',
    enum: StatusComite,
    enumName: 'status_comite_enum',
    default: StatusComite.EM_ANDAMENTO,
  })
  status: StatusComite;

  @Column({ length: 400, nullable: true })
  descricao: string | null;

  /** Registrado quando a conclusão foi feita com o pool estourado. */
  @Column({ name: 'concluido_com_pool_excedido', default: false })
  concluidoComPoolExcedido: boolean;

  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm: Date | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'concluido_por_id' })
  concluidoPor: Usuario | null;

  @Column({ name: 'concluido_por_id', type: 'uuid', nullable: true })
  concluidoPorId: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor: Usuario | null;

  @Index('idx_comites_criado_por')
  @Column({ name: 'criado_por_id', type: 'uuid', nullable: true })
  criadoPorId: string | null;

  // ------------------------------------------------------------------
  // Relacionamentos
  // ------------------------------------------------------------------

  /** Consultorias responsáveis, atendimentos de backup e o criador. */
  @OneToMany(() => ComiteResponsavel, (responsavel) => responsavel.comite, { cascade: true })
  responsaveis: ComiteResponsavel[];

  @OneToMany(() => Participante, (participante) => participante.comite)
  participantes: Participante[];

  @OneToOne(() => Ata, (ata) => ata.comite)
  ata: Ata | null;

  /** Layout da tabela de participantes, montado pelo Atendimento. */
  @OneToMany(() => ComiteColuna, (coluna) => coluna.comite, { cascade: true })
  colunas: ComiteColuna[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;

  @DeleteDateColumn({ name: 'removido_em', type: 'timestamptz', nullable: true })
  removidoEm: Date | null;

  get concluido(): boolean {
    return this.status === StatusComite.CONCLUIDO;
  }
}
