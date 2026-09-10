import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PerfilUsuario } from '../../common/enums';
import { GrupoResponsavel } from '../../grupos/entities/grupo-responsavel.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  nome: string;

  @Index('idx_usuarios_email', { unique: true })
  @Column({ length: 150, unique: true })
  email: string;

  /** Hash bcrypt — nunca é serializado nas respostas. */
  @Exclude({ toPlainOnly: true })
  @Column({ name: 'senha_hash', length: 255, select: false })
  senhaHash: string;

  @Column({
    type: 'enum',
    enum: PerfilUsuario,
    enumName: 'perfil_usuario_enum',
    default: PerfilUsuario.CONSULTORIA,
  })
  perfil: PerfilUsuario;

  @Column({ default: true })
  ativo: boolean;

  @Column({ name: 'ultimo_acesso_em', type: 'timestamptz', nullable: true })
  ultimoAcessoEm: Date | null;

  @OneToMany(() => GrupoResponsavel, (responsavel) => responsavel.usuario)
  gruposResponsaveis: GrupoResponsavel[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
