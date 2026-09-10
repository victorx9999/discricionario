export enum StatusComite {
  RASCUNHO = 'RASCUNHO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  FINALIZADO = 'FINALIZADO',
  APROVADO = 'APROVADO',
  CANCELADO = 'CANCELADO',
}

/** Status em que o comitê não aceita mais alteração de discricionário. */
export const STATUS_COMITE_BLOQUEADOS: StatusComite[] = [
  StatusComite.FINALIZADO,
  StatusComite.APROVADO,
  StatusComite.CANCELADO,
];
