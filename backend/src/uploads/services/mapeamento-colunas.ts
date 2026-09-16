/**
 * Mapeamento entre as colunas dos arquivos e os campos das entidades
 * (seção 4 da documentação).
 *
 * É o único ponto que conhece os nomes de coluna das bases. Quando a base
 * ganha uma coluna nova, adiciona-se a definição aqui e a coluna
 * correspondente por migration — nada mais no sistema muda.
 *
 * Colunas fora destas listas são ignoradas na carga e reportadas na
 * pré-visualização.
 */

export type TipoColuna = 'texto' | 'numero' | 'inteiro' | 'booleano' | 'data';

export interface DefinicaoColuna {
  /** Nome do campo na entidade. */
  campo: string;
  /** Rótulo usado nas mensagens de erro (nome da coluna no arquivo). */
  rotulo: string;
  /** Cabeçalhos aceitos, comparados de forma normalizada. */
  cabecalhos: string[];
  obrigatoria: boolean;
  tipo: TipoColuna;
  tamanhoMaximo?: number;
  /** Campo de decisão do comitê — preservado na carga PARCIAL. */
  decisao?: boolean;
}

/**
 * Normaliza um cabeçalho para comparação: minúsculas, sem acentos e sem
 * separadores. Assim "Nível de Cargo", "NIVEL_CARGO" e "nivelcargo" casam.
 */
export function normalizarCabecalho(texto: string): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const texto = (
  campo: string,
  rotulo: string,
  cabecalhos: string[],
  tamanhoMaximo: number,
  obrigatoria = false,
): DefinicaoColuna => ({ campo, rotulo, cabecalhos, obrigatoria, tipo: 'texto', tamanhoMaximo });

const numero = (
  campo: string,
  rotulo: string,
  cabecalhos: string[],
  obrigatoria = false,
): DefinicaoColuna => ({ campo, rotulo, cabecalhos, obrigatoria, tipo: 'numero' });

// ------------------------------------------------------------------
// 4.1 — TBPR_Simuladores (base principal)
// ------------------------------------------------------------------
export const COLUNAS_BASE_PRINCIPAL: DefinicaoColuna[] = [
  texto('nationalId', 'NATIONAL_ID', ['nationalid', 'cpf'], 30),
  texto('emplid', 'EMPLID', ['emplid', 'funcional', 'matricula'], 30, true),
  texto('nome', 'NAME', ['name', 'nome', 'nomecolaborador'], 200, true),

  { campo: 'dtUltimaFolha', rotulo: 'DTUFLPG', cabecalhos: ['dtuflpg'], obrigatoria: false, tipo: 'data' },
  {
    campo: 'dataAdmissao',
    rotulo: 'LAST_HIRE_DT',
    cabecalhos: ['lasthiredt', 'dtadmissao'],
    obrigatoria: false,
    tipo: 'data',
  },

  texto('company', 'COMPANY', ['company'], 20),
  texto('descrCompany', 'DESCR_COMPANY', ['descrcompany'], 150),
  texto('jobcode', 'JOBCODE', ['jobcode'], 30),
  texto('descrJobcode', 'DESCR_JOBCODE', ['descrjobcode'], 150),

  {
    campo: 'managerLevel',
    rotulo: 'MANAGER_LEVEL',
    cabecalhos: ['managerlevel'],
    obrigatoria: false,
    tipo: 'inteiro',
  },
  texto('xlatlongname', 'XLATLONGNAME', ['xlatlongname', 'nivelcargo', 'nivel'], 80),

  texto('deptid', 'DEPTID', ['deptid'], 30),
  texto('descrDeptid', 'DESCR_DEPTID', ['descrdeptid'], 150),
  texto('area', 'AREA', ['area'], 150),
  texto('areaOrigem', 'AREA_ORIGEM', ['areaorigem'], 150),
  texto('idsubmodelo', 'IDSUBMODELO', ['idsubmodelo'], 30),
  texto('descricaoSubmodelo', 'DESCRICAOSUBMODELO', ['descricaosubmodelo'], 150),

  numero('valorBase', 'VALORBASE', ['valorbase'], true),
  numero('vlBaseMes', 'VLBASEMES', ['vlbasemes']),
  numero('elegivel', 'ELEGIVEL', ['elegivel']),
  numero('elegTotal', 'ELEG_TOTAL', ['elegtotal']),
  numero('fpba', 'FPBA', ['fpba', 'fbpa']),
  numero('nota', 'NOTA', ['nota']),
  numero('fpi', 'FPI', ['fpi'], true),
  { ...numero('fd', 'FD', ['fd']), decisao: true },

  numero('calc1', 'CALC1', ['calc1']),
  numero('calc2', 'CALC2', ['calc2']),
  numero('calc3', 'CALC3', ['calc3']),
  numero('calc4', 'CALC4', ['calc4'], true),

  texto('grupoRanking', 'GRUPO_RANKING', ['gruporanking'], 150),
  texto('idpool', 'IDPOOL', ['idpool'], 60),
  texto('idcurva', 'IDCURVA', ['idcurva'], 60),

  numero('vbAnoAnterior', 'VB_ANO_ANTERIOR', ['vbanoanterior']),
  numero('prAnoAnterior1', 'PR_ANO_ANTERIOR1', ['pranoanterior1']),
  numero('prAnoAnterior2', 'PR_ANO_ANTERIOR2', ['pranoanterior2']),
  numero('prAnoAnterior3', 'PR_ANO_ANTERIOR3', ['pranoanterior3']),

  numero('totalCash', 'TOTAL_CASH', ['totalcash']),
  numero('totalCashAnoAnterior1', 'TOTAL_CASH_ANO_ANTERIOR1', ['totalcashanoanterior1']),
  numero('totalCashAnoAnterior2', 'TOTAL_CASH_ANO_ANTERIOR2', ['totalcashanoanterior2']),
  numero('totalCashAnoAnterior3', 'TOTAL_CASH_ANO_ANTERIOR3', ['totalcashanoanterior3']),

  numero('vlPrI', 'VL_PR_I', ['vlpri', 'valorpri']),
  numero('vlPrF', 'VL_PR_F', ['vlprf', 'valorprf']),
  numero('vlrTeorico', 'VLR_TEORICO', ['vlrteorico', 'valorteorico'], true),
  numero('notaAnoAnterior', 'NOTA_ANO_ANTERIOR', ['notaanoanterior']),

  texto('modeloAvaliacao', 'MODELO_AVALIACAO', ['modeloavaliacao'], 40),
  texto('flagComunidade', 'FLAG_COMUNIDADE', ['flagcomunidade'], 20),
  texto('areaGrupo', 'AREA_GRUPO', ['areagrupo'], 60),
  texto('nomeGrupo', 'NOME_GRUPO', ['nomegrupo'], 150),
  texto('statusContrato', 'STATUS_CONTRATO', ['statuscontrato'], 60),

  {
    campo: 'socioAnoAnterior',
    rotulo: 'SOCIO_ANO_ANTERIOR',
    cabecalhos: ['socioanoanterior', 'socioanterior'],
    obrigatoria: false,
    tipo: 'booleano',
  },
  {
    campo: 'socioAno',
    rotulo: 'SOCIO_ANO',
    cabecalhos: ['socioano', 'socio'],
    obrigatoria: false,
    tipo: 'booleano',
  },

  // Curva de interpolação da nota (opcional).
  numero('p1', 'P1', ['p1']),
  numero('p2', 'P2', ['p2']),
  numero('p3', 'P3', ['p3']),
  numero('p4', 'P4', ['p4']),
  numero('p5', 'P5', ['p5']),
  numero('n1', 'N1', ['n1']),
  numero('n2', 'N2', ['n2']),
  numero('n3', 'N3', ['n3']),
  numero('n4', 'N4', ['n4']),
  numero('n5', 'N5', ['n5']),

  // Campos de decisão do comitê — preservados na carga PARCIAL.
  { ...numero('notaDiscricionario', 'NOTA_DISCRICIONARIO', ['notadiscricionario']), decisao: true },
  {
    ...texto('motivoDiscricionario', 'MOTIVO_DISCRICIONARIO', ['motivodiscricionario'], 200),
    decisao: true,
  },
  {
    campo: 'codMotivador',
    rotulo: 'COD_MOTIVADOR',
    cabecalhos: ['codmotivador'],
    obrigatoria: false,
    tipo: 'inteiro',
    decisao: true,
  },
  {
    ...texto('observacaoPoscomite', 'OBSERVACAO_POSCOMITE', ['observacaoposcomite'], 4000),
    decisao: true,
  },
];

// ------------------------------------------------------------------
// 4.2 — TBPR_Simuladores_Acres (base de acréscimo)
// ------------------------------------------------------------------
export const COLUNAS_BASE_ACRESCIMO: DefinicaoColuna[] = [
  texto('emplid', 'EMPLID', ['emplid', 'funcional', 'matricula'], 30, true),
  {
    campo: 'flagCalcularPool',
    rotulo: 'FLAG_CALCULAR_POOL',
    cabecalhos: ['flagcalcularpool'],
    obrigatoria: true,
    tipo: 'booleano',
  },
  texto('tipoSimulador', 'TIPO_SIMULADOR', ['tiposimulador'], 40, true),
  texto('idpool', 'IDPOOL', ['idpool'], 60, true),
  texto('grupoRanking', 'GRUPO_RANKING', ['gruporanking'], 150),
  numero('vlrTeorico', 'VLR_TEORICO', ['vlrteorico', 'valorteorico'], true),
  numero('vlPrI', 'VL_PR_I', ['vlpri', 'valorpri']),
  numero('calc4', 'CALC4', ['calc4']),
  numero('fpi', 'FPI', ['fpi']),
  texto('area', 'AREA', ['area', 'areaorigem'], 150),
];

/** Campos de decisão do comitê, preservados quando a carga é PARCIAL. */
export const CAMPOS_DECISAO = COLUNAS_BASE_PRINCIPAL.filter((coluna) => coluna.decisao).map(
  (coluna) => coluna.campo,
);
