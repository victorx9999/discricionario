import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatusComite } from '../../common/enums';
import { Grupo } from '../../grupos/entities/grupo.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { AnaliseParticipante } from './analise-participante.entity';

@Entity('comites')
@Index('idx_comites_nome', ['nome'])
export class Comite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nome: string;

  @Index('idx_comites_codigo', { unique: true })
  @Column({ length: 50, unique: true })
  codigo: string;

  @ManyToOne(() => Grupo, (grupo) => grupo.comites, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'grupo_id' })
  grupo: Grupo;

  @Index('idx_comites_grupo')
  @Column({ name: 'grupo_id', type: 'uuid' })
  grupoId: string;

  @Column({
    type: 'enum',
    enum: StatusComite,
    enumName: 'status_comite_enum',
    default: StatusComite.RASCUNHO,
  })
  status: StatusComite;

  @Column({ length: 400, nullable: true })
  descricao: string | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor: Usuario | null;

  @Column({ name: 'criado_por_id', type: 'uuid', nullable: true })
  criadoPorId: string | null;

  @Column({ name: 'finalizado_em', type: 'timestamptz', nullable: true })
  finalizadoEm: Date | null;

  @Column({ name: 'aprovado_em', type: 'timestamptz', nullable: true })
  aprovadoEm: Date | null;

  @OneToMany(() => AnaliseParticipante, (analise) => analise.comite, { cascade: ['insert'] })
  analises: AnaliseParticipante[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
