/**
 * Catálogo das colunas da Tabela de Participantes.
 *
 * É a fonte da tabela customizável: o Atendimento escolhe daqui quais colunas
 * o comitê exibe, em que ordem e com que rótulo, e a Consultoria abre o comitê
 * já com esse layout. O frontend nunca precisa conhecer os nomes dos campos —
 * ele consome `GET /participantes/colunas` e `GET /comites/:id/colunas`.
 */

export type TipoColunaTabela =
  | 'texto'
  | 'moeda'
  | 'percentual'
  | 'pontos_percentuais'
  | 'numero'
  | 'fator'
  | 'booleano'
  | 'data';

export type GrupoColuna =
  | 'Identificação'
  | 'Cargo e área'
  | 'Performance'
  | 'Remuneração variável'
  | 'Discricionário'
  | 'Comparativos'
  | 'Total Cash'
  | 'Controle';

export interface DefinicaoColunaTabela {
  /** Chave usada no layout do comitê e na resposta da API. */
  chave: string;
  rotulo: string;
  grupo: GrupoColuna;
  tipo: TipoColunaTabela;
  /** `base` vem do arquivo; `calculado` é derivado pelo CalculoService. */
  origem: 'base' | 'calculado';
  /** Entra no layout padrão de um comitê recém-criado. */
  padrao: boolean;
  /** Congelada à esquerda por padrão. */
  fixa?: boolean;
  largura?: number;
  /** Permite ordenar a tabela por esta coluna. */
  ordenavel?: boolean;
  descricao?: string;
}

export const COLUNAS_TABELA_PARTICIPANTES: DefinicaoColunaTabela[] = [
  // --- Identificação -------------------------------------------------
  {
    chave: 'nome',
    rotulo: 'Nome do colaborador',
    grupo: 'Identificação',
    tipo: 'texto',
    origem: 'base',
    padrao: true,
    fixa: true,
    largura: 260,
    ordenavel: true,
  },
  {
    chave: 'emplid',
    rotulo: 'Funcional',
    grupo: 'Identificação',
    tipo: 'texto',
    origem: 'base',
    padrao: true,
    fixa: true,
    largura: 110,
    ordenavel: true,
  },
  {
    chave: 'nationalId',
    rotulo: 'National ID',
    grupo: 'Identificação',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 130,
  },
  {
    chave: 'dataAdmissao',
    rotulo: 'Admissão',
    grupo: 'Identificação',
    tipo: 'data',
    origem: 'base',
    padrao: false,
    largura: 110,
    ordenavel: true,
  },

  // --- Cargo e área --------------------------------------------------
  {
    chave: 'xlatlongname',
    rotulo: 'Nível',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: true,
    largura: 140,
    ordenavel: true,
  },
  {
    chave: 'descrJobcode',
    rotulo: 'Cargo',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 200,
    ordenavel: true,
  },
  {
    chave: 'managerLevel',
    rotulo: 'Manager level',
    grupo: 'Cargo e área',
    tipo: 'numero',
    origem: 'base',
    padrao: false,
    largura: 120,
  },
  {
    chave: 'area',
    rotulo: 'Área',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 180,
    ordenavel: true,
  },
  {
    chave: 'areaOrigem',
    rotulo: 'Área de origem',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 180,
  },
  {
    chave: 'descrDeptid',
    rotulo: 'Departamento',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 200,
  },
  {
    chave: 'descrCompany',
    rotulo: 'Empresa',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 180,
  },
  {
    chave: 'modeloAvaliacao',
    rotulo: 'Modelo de avaliação',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: true,
    largura: 150,
    ordenavel: true,
  },
  {
    chave: 'descricaoSubmodelo',
    rotulo: 'Submodelo',
    grupo: 'Cargo e área',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 160,
  },

  // --- Performance ---------------------------------------------------
  {
    chave: 'nota',
    rotulo: 'N',
    grupo: 'Performance',
    tipo: 'numero',
    origem: 'base',
    padrao: true,
    largura: 80,
    ordenavel: true,
    descricao: 'Nota de performance antes do discricionário',
  },
  {
    chave: 'notaAnoAnterior',
    rotulo: 'N ano anterior',
    grupo: 'Performance',
    tipo: 'numero',
    origem: 'base',
    padrao: false,
    largura: 120,
  },
  {
    chave: 'fpi',
    rotulo: 'FPI pré discricionário',
    grupo: 'Performance',
    tipo: 'percentual',
    origem: 'base',
    padrao: true,
    largura: 170,
    ordenavel: true,
  },
  {
    chave: 'fpiFinal',
    rotulo: 'FPI pós discricionário',
    grupo: 'Performance',
    tipo: 'percentual',
    origem: 'calculado',
    padrao: true,
    largura: 170,
    descricao: 'FPI + FD',
  },
  {
    chave: 'fpba',
    rotulo: 'FPBA',
    grupo: 'Performance',
    tipo: 'fator',
    origem: 'base',
    padrao: false,
    largura: 100,
  },
  {
    chave: 'notaPosDiscricionario',
    rotulo: 'N pós discricionário',
    grupo: 'Performance',
    tipo: 'numero',
    origem: 'calculado',
    padrao: true,
    largura: 160,
    descricao: 'Nota interpolada na curva P1..P5 / N1..N5 a partir do FPI_FINAL',
  },

  // --- Remuneração variável ------------------------------------------
  {
    chave: 'valorBase',
    rotulo: 'VB atual',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: true,
    largura: 150,
    ordenavel: true,
  },
  {
    chave: 'vbAnoAnterior',
    rotulo: 'VB ano anterior',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 150,
  },
  {
    chave: 'vlBaseMes',
    rotulo: 'VB mensal',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 130,
  },
  {
    chave: 'prSemDiscricionario',
    rotulo: 'PR sem discricionário',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: true,
    largura: 180,
    ordenavel: true,
    descricao: 'VL_PR_I + acréscimos elegíveis',
  },
  {
    chave: 'prPosDiscricionario',
    rotulo: 'PR pós discricionário',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: true,
    largura: 180,
    descricao: 'VL_PR_F + acréscimos recalculados com o mesmo FD',
  },
  {
    chave: 'vlPrI',
    rotulo: 'VL_PR_I',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 140,
  },
  {
    chave: 'vlPrF',
    rotulo: 'VL_PR_F',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: false,
    largura: 140,
  },
  {
    chave: 'vlrTeorico',
    rotulo: 'VLR teórico',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 150,
    ordenavel: true,
    descricao: 'Base do pool do comitê',
  },
  {
    chave: 'prAnoAnterior2',
    rotulo: 'PR ano anterior',
    grupo: 'Remuneração variável',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 150,
  },

  // --- Discricionário ------------------------------------------------
  {
    chave: 'fd',
    rotulo: 'Discricionário',
    grupo: 'Discricionário',
    tipo: 'pontos_percentuais',
    origem: 'base',
    padrao: true,
    largura: 140,
    ordenavel: true,
    descricao: 'FD em pontos percentuais',
  },
  {
    chave: 'motivoDiscricionario',
    rotulo: 'Motivo discricionário',
    grupo: 'Discricionário',
    tipo: 'texto',
    origem: 'base',
    padrao: true,
    largura: 260,
  },
  {
    chave: 'observacaoPoscomite',
    rotulo: 'Justificativa',
    grupo: 'Discricionário',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 320,
  },
  {
    chave: 'diferencaDiscricionario',
    rotulo: 'Impacto no pool',
    grupo: 'Discricionário',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: true,
    largura: 160,
    descricao: 'PR pós disc. − PR sem disc.',
  },
  {
    chave: 'fdForaLimite',
    rotulo: 'Fora do limite',
    grupo: 'Discricionário',
    tipo: 'booleano',
    origem: 'base',
    padrao: false,
    largura: 120,
  },
  {
    chave: 'pendente',
    rotulo: 'Pendência',
    grupo: 'Discricionário',
    tipo: 'booleano',
    origem: 'calculado',
    padrao: false,
    largura: 110,
    descricao: 'Discricionário sem motivador ou sem justificativa',
  },

  // --- Comparativos --------------------------------------------------
  {
    chave: 'percentualRv',
    rotulo: '% RV {A} x {P}',
    grupo: 'Comparativos',
    tipo: 'percentual',
    origem: 'calculado',
    padrao: false,
    largura: 140,
  },
  {
    chave: 'percentualTc',
    rotulo: '% TC {A} x {P}',
    grupo: 'Comparativos',
    tipo: 'percentual',
    origem: 'calculado',
    padrao: false,
    largura: 140,
  },
  {
    chave: 'deltaTcMaisSocios',
    rotulo: 'Delta TC+P.Sócios',
    grupo: 'Comparativos',
    tipo: 'percentual',
    origem: 'calculado',
    padrao: false,
    largura: 160,
  },

  // --- Total Cash ----------------------------------------------------
  {
    chave: 'totalCash',
    rotulo: 'Total Cash',
    grupo: 'Total Cash',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 150,
    ordenavel: true,
  },
  {
    chave: 'totalCashAnoAnterior2',
    rotulo: 'Total Cash ano anterior',
    grupo: 'Total Cash',
    tipo: 'moeda',
    origem: 'base',
    padrao: false,
    largura: 180,
  },
  {
    chave: 'tcMaisSociosAtual',
    rotulo: 'TC + P.Sócios {A}',
    grupo: 'Total Cash',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: false,
    largura: 170,
  },
  {
    chave: 'tcMaisSociosAnterior',
    rotulo: 'TC + P.Sócios {P}',
    grupo: 'Total Cash',
    tipo: 'moeda',
    origem: 'calculado',
    padrao: false,
    largura: 170,
  },
  {
    chave: 'socioAno',
    rotulo: 'Sócio',
    grupo: 'Total Cash',
    tipo: 'booleano',
    origem: 'base',
    padrao: false,
    largura: 90,
  },

  // --- Controle ------------------------------------------------------
  {
    chave: 'grupoRanking',
    rotulo: 'Grupo ranking',
    grupo: 'Controle',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 200,
  },
  {
    chave: 'statusContrato',
    rotulo: 'Status do contrato',
    grupo: 'Controle',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 160,
  },
  {
    chave: 'idpool',
    rotulo: 'ID pool',
    grupo: 'Controle',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 130,
  },
  {
    chave: 'idcurva',
    rotulo: 'ID curva',
    grupo: 'Controle',
    tipo: 'texto',
    origem: 'base',
    padrao: false,
    largura: 130,
  },
];

/** Índice por chave, para validar layouts sem varrer a lista. */
export const COLUNAS_POR_CHAVE = new Map(
  COLUNAS_TABELA_PARTICIPANTES.map((coluna) => [coluna.chave, coluna]),
);

/**
 * Campos que o painel de análise mostra por padrão — os que a reunião olha ao
 * decidir um FD. O Atendimento pode trocar esse conjunto por comitê.
 */
export const CAMPOS_PAINEL_PADRAO = [
  'valorBase',
  'fpi',
  'fpiFinal',
  'notaPosDiscricionario',
  'prSemDiscricionario',
  'prPosDiscricionario',
  'diferencaDiscricionario',
] as const;

export interface LinhaLayout {
  chave: string;
  visivel: boolean;
  ordem: number;
  largura: number | null;
  fixa: boolean;
  rotulo: string | null;
}

/** Layout inicial da TABELA de um comitê recém-criado. */
export function layoutPadrao(): LinhaLayout[] {
  return COLUNAS_TABELA_PARTICIPANTES.map((coluna, indice) => ({
    chave: coluna.chave,
    visivel: coluna.padrao,
    ordem: indice,
    largura: coluna.largura ?? null,
    fixa: Boolean(coluna.fixa),
    rotulo: null,
  }));
}

/** Layout inicial do PAINEL de análise de um comitê recém-criado. */
export function layoutPadraoPainel(): LinhaLayout[] {
  const ordemPadrao = CAMPOS_PAINEL_PADRAO as readonly string[];

  return COLUNAS_TABELA_PARTICIPANTES.map((coluna, indice) => {
    const posicao = ordemPadrao.indexOf(coluna.chave);
    return {
      chave: coluna.chave,
      visivel: posicao >= 0,
      ordem: posicao >= 0 ? posicao : 1000 + indice,
      largura: null,
      fixa: false,
      rotulo: null,
    };
  }).sort((a, b) => a.ordem - b.ordem);
}
