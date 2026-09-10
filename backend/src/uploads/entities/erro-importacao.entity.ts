import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Importacao } from './importacao.entity';

/** Detalhe de um registro inválido encontrado durante a importação. */
@Entity('erros_importacao')
export class ErroImportacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Importacao, (importacao) => importacao.erros, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'importacao_id' })
  importacao: Importacao;

  @Index('idx_erros_importacao')
  @Column({ name: 'importacao_id', type: 'uuid' })
  importacaoId: string;

  /** Número da linha no arquivo (1 = cabeçalho). */
  @Column({ type: 'int' })
  linha: number;

  @Column({ length: 80, nullable: true })
  coluna: string | null;

  @Column({ length: 255, nullable: true })
  valor: string | null;

  @Column({ length: 500 })
  mensagem: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
