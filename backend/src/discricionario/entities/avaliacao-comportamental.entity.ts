import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tabela de domínio das avaliações comportamentais.
 *
 * Modelada como tabela (e não enum de banco) porque a lista ainda não está
 * fechada: hoje existem SQV, TODOS, PERFORMANCE e um placeholder A_DEFINIR.
 * Novas opções entram por INSERT/seed, sem migration de schema nem deploy.
 */
@Entity('avaliacoes_comportamentais')
export class AvaliacaoComportamental {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40, unique: true })
  codigo: string;

  @Column({ length: 120 })
  nome: string;

  @Column({ length: 300, nullable: true })
  descricao: string | null;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}

/** Códigos conhecidos hoje. `A_DEFINIR` é o placeholder da quarta opção. */
export const AVALIACOES_COMPORTAMENTAIS_PADRAO = [
  { codigo: 'SQV', nome: 'SQV', descricao: 'Avaliação SQV', ordem: 1 },
  { codigo: 'TODOS', nome: 'Todos', descricao: 'Aplicável a todos os critérios', ordem: 2 },
  { codigo: 'PERFORMANCE', nome: 'Performance', descricao: 'Avaliação por performance', ordem: 3 },
  {
    codigo: 'A_DEFINIR',
    nome: 'A definir',
    descricao: 'Placeholder da quarta opção — renomeie o registro quando o nome for confirmado',
    ordem: 4,
  },
] as const;
