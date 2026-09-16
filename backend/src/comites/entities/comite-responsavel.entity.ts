import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PapelResponsavel } from '../../common/enums';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { Comite } from './comite.entity';

/**
 * Vínculo entre comitê e usuário responsável.
 *
 * Consultoria responsável e Atendimento de backup aceitam múltiplos nomes
 * (seção 6.2), por isso o relacionamento é uma tabela própria com o papel.
 * É também o que sustenta a regra de visibilidade da seção 2.
 */
@Entity('comite_responsaveis')
@Unique('uq_comite_responsavel', ['comiteId', 'usuarioId', 'papel'])
export class ComiteResponsavel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Comite, (comite) => comite.responsaveis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comite_id' })
  comite: Comite;

  @Index('idx_comite_responsaveis_comite')
  @Column({ name: 'comite_id', type: 'uuid' })
  comiteId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Index('idx_comite_responsaveis_usuario')
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ type: 'enum', enum: PapelResponsavel, enumName: 'papel_responsavel_enum' })
  papel: PapelResponsavel;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
