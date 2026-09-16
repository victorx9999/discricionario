/** Modelo de avaliação do participante (MODELO_AVALIACAO). */
export enum ModeloAvaliacao {
  INSTITUCIONAL = 'Institucional',
  COMUNIDADE = 'Comunidade',
}

/** Composição de modelos dentro de um comitê. */
export enum TipoComite {
  INSTITUCIONAL = 'Institucional',
  COMUNIDADE = 'Comunidade',
  MISTO = 'Misto',
}

/** Resultado da checagem de HC por nível/modelo. */
export enum ResultadoChecagem {
  OK = 'OK',
  REVER = 'REVER',
}
