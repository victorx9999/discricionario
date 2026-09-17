/**
 * Tipos espelhando os DTOs da API. Toda conta financeira é feita no backend com
 * `decimal.js` — aqui os números chegam prontos e o frontend só formata.
 */

// ---------------------------------------------------------------------------
// Genéricos
// ---------------------------------------------------------------------------

export interface ResultadoPaginado<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Contrato de erro padronizado da API (`HttpExcecaoFilter`).
 *
 * `message` vem como string na maioria dos casos e como array quando é o
 * `ValidationPipe` reclamando de vários campos de uma vez — por isso o tipo
 * união. Use `mensagemDoErro()` em vez de ler o campo direto.
 */
export interface ErroApi {
  statusCode: number;
  message: string | string[];
  error: string;
  codigo?: string;
  detalhes?: Record<string, unknown>;
  timestamp?: string;
  path?: string;
}

/** Achata o `message` da API numa única frase legível. */
export function mensagemDoErro(erro: Partial<ErroApi> | null | undefined): string | null {
  if (!erro?.message) return null;
  return Array.isArray(erro.message) ? erro.message.join(' · ') : erro.message;
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

export type PerfilUsuario = 'ADMIN' | 'ATENDIMENTO' | 'CONSULTORIA';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo?: boolean;
}

export interface RespostaLogin {
  accessToken: string;
  usuario: Usuario;
  expiresIn?: string;
}

// ---------------------------------------------------------------------------
// Ciclos
// ---------------------------------------------------------------------------

export type StatusCiclo = 'ABERTO' | 'FECHADO';

export interface Ciclo {
  id: string;
  ano: number;
  descricao?: string | null;
  status: StatusCiclo;
  ativo: boolean;
  rotuloComparativo?: string | null;
  percentualPool: number;
  limiteFd: number;
  divisorHcMax: number;
  fatorPep: number;
  fatorDiferimento: number;
  bloquearPoolExcedido: boolean;
  tipoSimuladorPerformance?: string | null;
}

export interface PremissasCiclo {
  percentualPool?: number;
  limiteFd?: number;
  divisorHcMax?: number;
  fatorPep?: number;
  fatorDiferimento?: number;
  bloquearPoolExcedido?: boolean;
  tipoSimuladorPerformance?: string;
  rotuloComparativo?: string;
}

// ---------------------------------------------------------------------------
// Comitês
// ---------------------------------------------------------------------------

export type StatusComite = 'EM_ANDAMENTO' | 'CONCLUIDO';
export type TipoComite = 'Institucional' | 'Comunidade' | 'Misto';

export interface Comite {
  id: string;
  cicloId: string;
  codigo: string;
  nome: string;
  grupoRanking?: string | null;
  area?: string | null;
  tipo: TipoComite;
  status: StatusComite;
  descricao?: string | null;
  totalParticipantes?: number;
  responsaveis?: ResponsavelComite[];
  temAta?: boolean;
  concluidoEm?: string | null;
}

export interface ResponsavelComite {
  id: string;
  usuarioId: string;
  nome?: string;
  papel: 'CONSULTORIA' | 'BACKUP' | 'ATENDIMENTO';
}

export interface CriarComite {
  codigo: string;
  nome: string;
  ciclo?: number;
  area?: string;
  descricao?: string;
  consultoriaIds?: string[];
  backupIds?: string[];
  participanteIds?: string[];
}

// ---------------------------------------------------------------------------
// Participantes
// ---------------------------------------------------------------------------

export interface AcrescimoParticipante {
  id: string;
  area: string | null;
  vlrTeorico: number;
  vlPrI: number;
  elegivel: boolean;
}

/** Linha da tabela de participantes, já com tudo calculado pela API. */
export interface ParticipanteLinha {
  id: string;
  emplid: string;
  nome: string;
  nationalId: string | null;
  dataAdmissao: string | null;

  xlatlongname: string | null;
  descrJobcode: string | null;
  managerLevel: number | null;
  area: string | null;
  areaOrigem: string | null;
  descrDeptid: string | null;
  descrCompany: string | null;
  modeloAvaliacao: string | null;
  descricaoSubmodelo: string | null;

  nota: number;
  notaAnoAnterior: number;
  fpi: number;
  fpiFinal: number;
  fpba: number;
  notaPosDiscricionario: number | null;

  valorBase: number;
  vbAnoAnterior: number;
  vlBaseMes: number;
  vlPrI: number;
  vlPrF: number;
  vlrTeorico: number;
  prAnoAnterior2: number;
  prSemDiscricionario: number;
  prPosDiscricionario: number;

  fd: number;
  fdPp: string;
  codMotivador: number | null;
  motivoDiscricionario: string | null;
  observacaoPoscomite: string | null;
  diferencaDiscricionario: number;
  fdForaLimite: boolean;
  pendente: boolean;

  percentualRv: number | null;
  percentualTc: number | null;
  deltaTcMaisSocios: number | null;

  totalCash: number;
  totalCashAnoAnterior2: number;
  tcMaisSociosAtual: number;
  tcMaisSociosAnterior: number;
  socioAno: boolean;

  grupoRanking: string | null;
  statusContrato: string | null;
  idpool: string | null;
  idcurva: string | null;
  comiteId: string | null;

  acrescimos: AcrescimoParticipante[];
}

export interface LancarDiscricionario {
  fd: number;
  codMotivador?: number;
  justificativa?: string;
  confirmarForaDoLimite?: boolean;
}

export interface PontoSerie {
  ano: number;
  valor: number;
  comDiscricionario?: boolean;
}

export interface GraficosParticipante {
  participanteId: string;
  nome: string;
  ciclo: number;
  rotuloComparativo?: string | null;
  series: {
    remuneracaoVariavel: PontoSerie[];
    totalCash: PontoSerie[];
    totalCashMaisSocios: PontoSerie[];
  };
  variacoes: {
    percentualRv: number | null;
    percentualTc: number | null;
    deltaTcMaisSocios: number | null;
  };
}

export interface OpcoesFiltro {
  niveis: string[];
  modelos: string[];
  areas: string[];
  gruposRanking: string[];
  statusContrato?: string[];
}

// ---------------------------------------------------------------------------
// Catálogo de campos e layout do comitê
// ---------------------------------------------------------------------------

export type ContextoColuna = 'TABELA' | 'PAINEL';

export type TipoColuna =
  | 'texto'
  | 'numero'
  | 'moeda'
  | 'fator'
  | 'percentual'
  | 'pontosPercentuais'
  | 'data'
  | 'booleano';

export interface DefinicaoColuna {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: TipoColuna;
  origem: string;
  padrao: boolean;
  largura?: number | null;
  fixa?: boolean;
  ordenavel?: boolean;
  descricao?: string;
}

export interface ColunaResolvida {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: TipoColuna | string;
  origem: string;
  visivel: boolean;
  ordem: number;
  largura: number | null;
  fixa: boolean;
  ordenavel: boolean;
  descricao?: string;
}

export interface LayoutContexto {
  contexto: ContextoColuna;
  personalizado: boolean;
  colunas: ColunaResolvida[];
}

/** O que `GET /comites/:id/colunas` devolve sem o parâmetro `contexto`. */
export interface LayoutComite {
  tabela: LayoutContexto;
  painel: LayoutContexto;
}

export interface SalvarColunas {
  contexto?: ContextoColuna;
  colunas: Array<{
    chave: string;
    visivel?: boolean;
    ordem?: number;
    largura?: number;
    fixa?: boolean;
    rotulo?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Resumo e pool
// ---------------------------------------------------------------------------

export type ResultadoChecagem = 'OK' | 'REVER';

export interface BlocoModelo {
  modelo: string;
  hcTotal: number;
  hcMaximo: number;
  reducao: number;
  aumento: number;
  hcComDiscricionario: number;
  checagem: ResultadoChecagem;
  discricionarioPositivo: number;
  discricionarioNegativo: number;
  saldo: number;
}

export interface LinhaResumoNivel {
  nivel: string;
  totalHc: number;
  modelos: BlocoModelo[];
  institucional: BlocoModelo;
  comunidade: BlocoModelo;
}

export interface PerformancePonderada {
  antes: number | null;
  depois: number | null;
  variacao: number | null;
  modelo: string;
}

export interface ResultadoPool {
  vlrTeoricoTotal: number;
  percentual: number;
  poolDisponivel: number;
  poolConsumido: number;
  saldo: number;
  percentualUtilizado: number;
  excedido: boolean;
}

export interface ResumoComite {
  comiteId: string;
  ciclo: number;
  totalParticipantes: number;
  analisados: number;
  pendentesDeAnalise: number;
  pendencias: number;
  porNivelCargo: LinhaResumoNivel[];
  porModeloAvaliacao: BlocoModelo[];
  performancePonderada: PerformancePonderada;
  pool: ResultadoPool;
  precisaRever: boolean;
}

export interface ParticipantePendente {
  id: string;
  emplid: string;
  nome: string;
  fd: number;
  faltaMotivador: boolean;
  faltaJustificativa: boolean;
}

export interface Pendencias {
  comiteId: string;
  /** Mensagens que impedem a conclusão do comitê (ATA incompleta, discricionário sem motivador...). */
  bloqueiam: string[];
  /** Avisos que não bloqueiam, mas ficam registrados (pool excedido, nível a rever). */
  alertam: string[];
  poolExcedido: boolean;
  pool: ResultadoPool;
  participantesPendentes: ParticipantePendente[];
  podeConcluir: boolean;
}

// ---------------------------------------------------------------------------
// ATA
// ---------------------------------------------------------------------------

export interface AtaParticipante {
  nome: string;
  papel?: string;
  usuarioId?: string;
}

export interface Ata {
  id?: string;
  comiteId?: string;
  data?: string | null;
  horaInicio?: string | null;
  horaFim?: string | null;
  observacoes?: string | null;
  anexos?: Array<Record<string, unknown>>;
  participantes?: AtaParticipante[];
}

// ---------------------------------------------------------------------------
// Motivadores
// ---------------------------------------------------------------------------

export interface Motivo {
  id: string;
  codigo: number;
  descricao: string;
  limiteFd: number | null;
  exigeJustificativa: boolean;
  ativo: boolean;
  ordem?: number;
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export type TipoBase = 'PRINCIPAL' | 'ACRESCIMO';
export type ModoCarga = 'COMPLETA' | 'PARCIAL';
export type StatusImportacao = 'CONCLUIDA' | 'CONCLUIDA_COM_ERROS' | 'FALHOU';

export interface ErroLinha {
  linha: number;
  coluna?: string;
  valor?: unknown;
  mensagem: string;
}

export interface PreviaUpload {
  delimitador: string;
  totalRegistros: number;
  registrosValidos: number;
  registrosComErro: number;
  novos: number;
  atualizados: number;
  colunasReconhecidas: string[];
  colunasIgnoradas: string[];
  colunasObrigatoriasAusentes: string[];
  amostra: Array<Record<string, unknown>>;
  erros: ErroLinha[];
  impactoDoReinicio?: Record<string, number> | null;
}

export interface Importacao {
  id: string;
  cicloId: string;
  tipoBase: TipoBase;
  modo: ModoCarga;
  status: StatusImportacao;
  arquivo: string;
  registrosInseridos: number;
  registrosAtualizados: number;
  registrosRemovidos: number;
  totalErros: number;
  resumo?: Record<string, unknown>;
  criadoEm: string;
  usuarioNome?: string;
}

export interface LayoutBase {
  tipo: TipoBase;
  obrigatorias: string[];
  opcionais: string[];
}

// ---------------------------------------------------------------------------
// Consolidação
// ---------------------------------------------------------------------------

export interface VisaoGeral {
  ciclo: number;
  rotuloComparativo?: string | null;
  kpis: {
    comites: number;
    comitesConcluidos: number;
    comitesEmAndamento: number;
    participantes: number;
    participantesAnalisados: number;
    participantesPendentes: number;
    elegiveisSemComite: number;
    vlrTeoricoTotal: number;
    poolDisponivel: number;
    poolConsumido: number;
    poolSaldo: number;
    percentualUtilizado: number;
  };
  alertas: Array<{ tipo: string; mensagem: string; comiteId?: string }>;
  graficos: Record<string, unknown>;
  porComite: Array<{
    comiteId: string;
    codigo: string;
    nome: string;
    grupoRanking: string | null;
    status: StatusComite;
    temAta: boolean;
    participantes: number;
    analisados: number;
    pendencias: number;
    poolDisponivel: number;
    poolConsumido: number;
    saldo: number;
    percentualUtilizado: number;
    excedido: boolean;
    precisaRever: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export interface LogAuditoria {
  id: string;
  acao: string;
  operacao: string;
  entidade: string;
  entidadeId: string | null;
  cicloId: string | null;
  comiteId: string | null;
  usuarioNome: string | null;
  usuarioEmail: string | null;
  campoAlterado: string | null;
  valorAnterior: unknown;
  valorNovo: unknown;
  origem: string;
  ip: string | null;
  criadoEm: string;
}

export interface EventoFrontend {
  acao: string;
  entidade?: string;
  entidadeId?: string;
  comiteId?: string;
  detalhes?: Record<string, unknown>;
}
