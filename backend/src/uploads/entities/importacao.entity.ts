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
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import { ModoCarga, StatusImportacao, TipoBase } from '../../common/enums';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { ErroImportacao } from './erro-importacao.entity';

/** Cabeçalho de uma carga de base (upload), sempre dentro de um ciclo. */
@Entity('importacoes')
@Index('idx_importacoes_criado_em', ['criadoEm'])
export class Importacao {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ciclo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo: Ciclo;

  @Index('idx_importacoes_ciclo')
  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId: string;

  @Column({ name: 'tipo_base', type: 'enum', enum: TipoBase, enumName: 'tipo_base_enum' })
  tipoBase: TipoBase;

  @Column({ type: 'enum', enum: ModoCarga, enumName: 'modo_carga_enum', default: ModoCarga.PARCIAL })
  modo: ModoCarga;

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

  /** Colunas reconhecidas/ignoradas e efeitos colaterais da carga completa. */
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
