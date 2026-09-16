/**
 * Papel de um usuário dentro do comitê.
 *
 * A regra de visibilidade (seção 2) usa estes papéis: Atendimento enxerga os
 * comitês que criou e aqueles em que é backup; Consultoria enxerga apenas
 * aqueles em que consta como responsável; Admin enxerga tudo.
 */
export enum PapelResponsavel {
  /** Consultoria responsável pelo comitê. */
  CONSULTORIA = 'CONSULTORIA',
  /** Atendimento de backup do comitê. */
  BACKUP = 'BACKUP',
  /** Usuário (Atendimento/Admin) que cadastrou o comitê. */
  CRIADOR = 'CRIADOR',
}
