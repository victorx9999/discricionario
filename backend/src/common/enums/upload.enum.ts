/** Base que está sendo importada. */
export enum TipoBase {
  /** TBPR_Simuladores — base principal dos participantes. */
  PRINCIPAL = 'PRINCIPAL',
  /** TBPR_Simuladores_Acres — acréscimos de colaboradores transferidos. */
  ACRESCIMO = 'ACRESCIMO',
}

/**
 * Estratégia de carga (seção 4.2 / 6.1).
 *
 * COMPLETA  — truncate do ciclo alvo: reinicia o ciclo apagando comitês,
 *             ATAs e discricionários DAQUELE ciclo. Ciclos anteriores nunca
 *             são tocados.
 * PARCIAL   — atualiza/insere sem truncate, preservando as decisões do comitê
 *             (FD, nota, motivo, justificativa, COD_MOTIVADOR) e recalculando
 *             FPI_FINAL e VL_PR_F.
 *
 * A base de acréscimo é sempre truncate do ciclo alvo.
 */
export enum ModoCarga {
  COMPLETA = 'COMPLETA',
  PARCIAL = 'PARCIAL',
}

export enum StatusImportacao {
  PROCESSANDO = 'PROCESSANDO',
  CONCLUIDO = 'CONCLUIDO',
  CONCLUIDO_COM_ERROS = 'CONCLUIDO_COM_ERROS',
  FALHOU = 'FALHOU',
}
