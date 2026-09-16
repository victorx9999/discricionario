/** Situação do ciclo (ano-base) do discricionário. */
export enum StatusCiclo {
  /** Aceita cargas, criação de comitês e lançamentos. */
  ABERTO = 'ABERTO',
  /** Histórico: somente leitura. Nenhuma carga ou lançamento é aceito. */
  FECHADO = 'FECHADO',
}
