import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ContextoColuna } from '../../common/enums';
import { Comite } from './comite.entity';

/**
 * Layout da tabela de participantes, por comitê.
 *
 * O Atendimento monta o comitê e salva aqui quais colunas aparecem, em que
 * ordem, com que largura e rótulo. A Consultoria abre o comitê e já enxerga a
 * tabela do jeito que foi montada — sem precisar configurar nada.
 *
 * As chaves válidas vêm do catálogo em `participantes/colunas-participante.ts`.
 */
@Entity('comite_colunas')
@Unique('uq_comite_coluna', ['comiteId', 'chave', 'contexto'])
export class ComiteColuna {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Comite, (comite) => comite.colunas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'comite_id' })
  comite: Comite;

  @Index('idx_comite_colunas_comite')
  @Column({ name: 'comite_id', type: 'uuid' })
  comiteId: string;

  /** Chave da coluna no catálogo (ex.: `vlPrF`, `fdPp`, `totalCash`). */
  @Column({ length: 60 })
  chave: string;

  /**
   * Onde o campo aparece: TABELA (colunas da tabela de participantes) ou
   * PAINEL (campos de valor do painel de análise). São layouts independentes,
   * ambos montados pelo Atendimento.
   */
  @Column({ type: 'enum', enum: ContextoColuna, default: ContextoColuna.TABELA })
  contexto: ContextoColuna;

  @Column({ default: true })
  visivel: boolean;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  /** Largura sugerida em pixels. */
  @Column({ type: 'int', nullable: true })
  largura: number | null;

  /** Coluna congelada à esquerda na rolagem horizontal. */
  @Column({ default: false })
  fixa: boolean;

  /** Rótulo customizado; quando nulo, usa o do catálogo. */
  @Column({ length: 80, nullable: true })
  rotulo: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
