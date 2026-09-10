/**
 * Mapeamento entre as colunas dos arquivos CSV e os campos das entidades.
 *
 * Este é o único ponto que precisa ser tocado quando a base ganha uma coluna
 * nova: adiciona-se a definição aqui e a coluna correspondente por migration.
 * Nenhum outro ponto do sistema conhece os nomes de coluna do arquivo.
 */

export type TipoColuna = 'texto' | 'numero' | 'inteiro' | 'booleano';

export interface DefinicaoColuna {
  /** Nome do campo na entidade. */
  campo: string;
  /** Rótulo amigável usado nas mensagens de erro. */
  rotulo: string;
  /** Cabeçalhos aceitos no arquivo (comparados de forma normalizada). */
  cabecalhos: string[];
  obrigatoria: boolean;
  tipo: TipoColuna;
  tamanhoMaximo?: number;
}

/**
 * Normaliza um cabeçalho para comparação: minúsculas, sem acentos e sem
 * separadores. Assim "Nível de Cargo", "NIVEL_CARGO" e "nivelcargo" casam.
 */
export function normalizarCabecalho(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ------------------------------------------------------------------
// Base principal
// ------------------------------------------------------------------
export const COLUNAS_BASE_PRINCIPAL: DefinicaoColuna[] = [
  {
    campo: 'funcional',
    rotulo: 'FUNCIONAL',
    cabecalhos: ['funcional', 'matricula', 'identificador', 'id'],
    obrigatoria: true,
    tipo: 'texto',
    tamanhoMaximo: 30,
  },
  {
    campo: 'nome',
    rotulo: 'NOME',
    cabecalhos: ['nome', 'nomeparticipante', 'nomecompleto'],
    obrigatoria: true,
    tipo: 'texto',
    tamanhoMaximo: 200,
  },
  {
    campo: 'cargo',
    rotulo: 'CARGO',
    cabecalhos: ['cargo'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 150,
  },
  {
    campo: 'nivelCargo',
    rotulo: 'NIVEL_CARGO',
    cabecalhos: ['nivelcargo', 'niveldecargo', 'nivel'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 80,
  },
  {
    campo: 'modeloAvaliacao',
    rotulo: 'MODELO_AVALIACAO',
    cabecalhos: ['modeloavaliacao', 'modelodeavaliacao', 'modelo'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 80,
  },
  {
    campo: 'area',
    rotulo: 'AREA',
    cabecalhos: ['area', 'areaatual'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 150,
  },
  {
    campo: 'areaOrigem',
    rotulo: 'AREA_ORIGEM',
    cabecalhos: ['areaorigem'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 150,
  },
  { campo: 'fpi', rotulo: 'FPI', cabecalhos: ['fpi'], obrigatoria: true, tipo: 'numero' },
  {
    campo: 'fpiFinal',
    rotulo: 'FPI_FINAL',
    cabecalhos: ['fpifinal'],
    obrigatoria: false,
    tipo: 'numero',
  },
  { campo: 'fbpa', rotulo: 'FBPA', cabecalhos: ['fbpa'], obrigatoria: true, tipo: 'numero' },
  { campo: 'fd', rotulo: 'FD', cabecalhos: ['fd'], obrigatoria: false, tipo: 'numero' },
  {
    campo: 'valorBase',
    rotulo: 'VALORBASE',
    cabecalhos: ['valorbase'],
    obrigatoria: true,
    tipo: 'numero',
  },
  {
    campo: 'valorPrI',
    rotulo: 'VALOR_PR_I',
    cabecalhos: ['valorpri', 'vlpri', 'valorprinicial'],
    obrigatoria: false,
    tipo: 'numero',
  },
  {
    campo: 'valorPrF',
    rotulo: 'VALOR_PR_F',
    cabecalhos: ['valorprf', 'vlprf', 'valorprfinal'],
    obrigatoria: false,
    tipo: 'numero',
  },
  {
    campo: 'vlrTeorico',
    rotulo: 'VLRTEORICO',
    cabecalhos: ['vlrteorico', 'valorteorico'],
    obrigatoria: true,
    tipo: 'numero',
  },
];

// ------------------------------------------------------------------
// Base de acréscimo
// ------------------------------------------------------------------
export const COLUNAS_BASE_ACRESCIMO: DefinicaoColuna[] = [
  {
    campo: 'funcional',
    rotulo: 'FUNCIONAL',
    cabecalhos: ['funcional', 'matricula', 'identificador', 'id'],
    obrigatoria: true,
    tipo: 'texto',
    tamanhoMaximo: 30,
  },
  {
    campo: 'areaOrigem',
    rotulo: 'AREA_ORIGEM',
    cabecalhos: ['areaorigem', 'area'],
    obrigatoria: true,
    tipo: 'texto',
    tamanhoMaximo: 150,
  },
  {
    campo: 'valorAcrescimoPrI',
    rotulo: 'ACRESCIMO_PR_I',
    cabecalhos: ['acrescimopri', 'valoracrescimopri', 'acrescimovlpri', 'acrescimovalorpri'],
    obrigatoria: true,
    tipo: 'numero',
  },
  {
    campo: 'valorAcrescimoPrF',
    rotulo: 'ACRESCIMO_PR_F',
    cabecalhos: ['acrescimoprf', 'valoracrescimoprf', 'acrescimovlprf', 'acrescimovalorprf'],
    obrigatoria: true,
    tipo: 'numero',
  },
  {
    campo: 'observacao',
    rotulo: 'OBSERVACAO',
    cabecalhos: ['observacao', 'obs'],
    obrigatoria: false,
    tipo: 'texto',
    tamanhoMaximo: 300,
  },
];
