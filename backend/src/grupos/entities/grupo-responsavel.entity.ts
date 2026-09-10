import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PapelResponsavel } from '../../common/enums';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Grupo } from './grupo.entity';

/**
 * Vínculo entre grupo e usuário responsável.
 *
 * Um grupo pode ter várias consultoras e vários atendimentos de backup — por
 * isso o relacionamento é uma tabela própria com o papel de cada usuário.
 */
@Entity('grupo_responsaveis')
@Unique('uq_grupo_responsavel', ['grupoId', 'usuarioId', 'papel'])
export class GrupoResponsavel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Grupo, (grupo) => grupo.responsaveis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'grupo_id' })
  grupo: Grupo;

  @Column({ name: 'grupo_id', type: 'uuid' })
  grupoId: string;

  @ManyToOne(() => Usuario, (usuario) => usuario.gruposResponsaveis, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ type: 'enum', enum: PapelResponsavel, enumName: 'papel_responsavel_enum' })
  papel: PapelResponsavel;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
