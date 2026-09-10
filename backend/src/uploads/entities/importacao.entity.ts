import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ModoProcessamento, StatusImportacao, TipoBase } from '../../common/enums';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { ErroImportacao } from './erro-importacao.entity';

/** Cabeçalho de uma importação de base (upload). */
@Entity('importacoes')
@Index('idx_importacoes_criado_em', ['criadoEm'])
export class Importacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tipo_base', type: 'enum', enum: TipoBase, enumName: 'tipo_base_enum' })
  tipoBase: TipoBase;

  @Column({
    type: 'enum',
    enum: ModoProcessamento,
    enumName: 'modo_processamento_enum',
    default: ModoProcessamento.INCREMENTAL,
  })
  modo: ModoProcessamento;

  @Column({ name: 'nome_arquivo', length: 255 })
  nomeArquivo: string;

  @Column({ name: 'tamanho_bytes', type: 'bigint', default: 0 })
  tamanhoBytes: string;

  @Column({
    type: 'enum',
    enum: StatusImportacao,
    enumName: 'status_importacao_enum',
    default: StatusImportacao.PROCESSANDO,
  })
  status: StatusImportacao;

  @Column({ name: 'total_registros', type: 'int', default: 0 })
  totalRegistros: number;

  @Column({ name: 'registros_processados', type: 'int', default: 0 })
  registrosProcessados: number;

  @Column({ name: 'registros_inseridos', type: 'int', default: 0 })
  registrosInseridos: number;

  @Column({ name: 'registros_atualizados', type: 'int', default: 0 })
  registrosAtualizados: number;

  @Column({ name: 'registros_removidos', type: 'int', default: 0 })
  registrosRemovidos: number;

  @Column({ name: 'registros_com_erro', type: 'int', default: 0 })
  registrosComErro: number;

  @Column({ name: 'mensagem_erro', type: 'text', nullable: true })
  mensagemErro: string | null;

  /** Efeitos colaterais do modo COMPLETO (grupos/comitês limpos, etc.). */
  @Column({ type: 'jsonb', nullable: true })
  resumo: Record<string, unknown> | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'executado_por_id' })
  executadoPor: Usuario | null;

  @Column({ name: 'executado_por_id', type: 'uuid', nullable: true })
  executadoPorId: string | null;

  @OneToMany(() => ErroImportacao, (erro) => erro.importacao, { cascade: true })
  erros: ErroImportacao[];

  @Column({ name: 'finalizado_em', type: 'timestamptz', nullable: true })
  finalizadoEm: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
