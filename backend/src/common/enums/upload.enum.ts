/** Base de dados que está sendo importada. */
export enum TipoBase {
  /** Base principal: dados dos participantes e valores usados nos cálculos. */
  PRINCIPAL = 'PRINCIPAL',
  /** Base de acréscimo: complementos por área de origem. */
  ACRESCIMO = 'ACRESCIMO',
}

/** Estratégia de processamento do arquivo. */
export enum ModoProcessamento {
  /** Substitui os dados existentes e limpa as tabelas dependentes. */
  COMPLETO = 'COMPLETO',
  /** Atualiza/insere registros sem apagar os dados existentes. */
  INCREMENTAL = 'INCREMENTAL',
}

export enum StatusImportacao {
  PROCESSANDO = 'PROCESSANDO',
  CONCLUIDO = 'CONCLUIDO',
  CONCLUIDO_COM_ERROS = 'CONCLUIDO_COM_ERROS',
  FALHOU = 'FALHOU',
}
