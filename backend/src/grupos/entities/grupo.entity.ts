import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatusGrupo } from '../../common/enums';
import { Comite } from '../../comites/entities/comite.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { GrupoResponsavel } from './grupo-responsavel.entity';

@Entity('grupos')
@Index('idx_grupos_nome', ['nome'])
export class Grupo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nome: string;

  @Index('idx_grupos_codigo', { unique: true })
  @Column({ length: 50, unique: true })
  codigo: string;

  @Column({
    type: 'enum',
    enum: StatusGrupo,
    enumName: 'status_grupo_enum',
    default: StatusGrupo.ATIVO,
  })
  status: StatusGrupo;

  @Column({ length: 400, nullable: true })
  descricao: string | null;

  /** Usuário que cadastrou o grupo (além dos responsáveis explícitos). */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'criado_por_id' })
  criadoPor: Usuario | null;

  @Column({ name: 'criado_por_id', type: 'uuid', nullable: true })
  criadoPorId: string | null;

  /** Consultoras responsáveis e atendimentos de backup (N por grupo). */
  @OneToMany(() => GrupoResponsavel, (responsavel) => responsavel.grupo, { cascade: true })
  responsaveis: GrupoResponsavel[];

  @ManyToMany(() => Participante, (participante) => participante.grupos)
  @JoinTable({
    name: 'grupo_participantes',
    joinColumn: { name: 'grupo_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'participante_id', referencedColumnName: 'id' },
  })
  participantes: Participante[];

  @OneToMany(() => Comite, (comite) => comite.grupo)
  comites: Comite[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
