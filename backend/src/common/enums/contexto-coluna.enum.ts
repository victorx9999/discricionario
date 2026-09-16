/**
 * Onde um campo do catálogo aparece na tela do comitê.
 *
 * O Atendimento monta os dois conjuntos ao criar o comitê; a Consultoria abre
 * a tela já com eles aplicados. São listas independentes — o mesmo campo pode
 * estar só na tabela, só no painel, nos dois ou em nenhum.
 */
export enum ContextoColuna {
  /** Colunas da Tabela de Participantes, embaixo da tela. */
  TABELA = 'TABELA',
  /** Campos de valor do painel de análise do participante selecionado. */
  PAINEL = 'PAINEL',
}
