/**
 * Fontes de dados FICTÍCIOS usados apenas em desenvolvimento e testes.
 * Nenhum nome, matrícula ou valor corresponde a pessoas ou remunerações reais.
 */

export const PRIMEIROS_NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Elisa', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'João', 'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo',
  'Queila', 'Rafael', 'Sofia', 'Thiago', 'Ursula', 'Vitor', 'Wanda', 'Yasmin',
  'Zeca', 'Amanda', 'Caio', 'Débora', 'Eduardo', 'Fernanda',
];

export const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Ferreira', 'Gomes',
  'Henriques', 'Iglesias', 'Jardim', 'Klein', 'Lima', 'Moraes', 'Nunes',
  'Oliveira', 'Pereira', 'Quintana', 'Ribeiro', 'Santos', 'Teixeira',
];

/** Níveis de cargo com o MANAGER_LEVEL correspondente (seção 4.1). */
export const NIVEIS_CARGO = [
  { nivel: 'Superintendente', managerLevel: 30, pesoBase: 3 },
  { nivel: 'Gerente', managerLevel: 35, pesoBase: 2 },
  { nivel: 'Coordenador', managerLevel: 40, pesoBase: 1.4 },
  { nivel: 'Especialista', managerLevel: 45, pesoBase: 1.1 },
  { nivel: 'Analista Sênior', managerLevel: 50, pesoBase: 0.9 },
  { nivel: 'Analista Pleno', managerLevel: 55, pesoBase: 0.7 },
];

export const CARGOS = [
  'Analista de Sistemas',
  'Analista Financeiro',
  'Especialista de Produto',
  'Engenheiro de Software',
  'Cientista de Dados',
  'Consultor de Investimentos',
  'Coordenador de Operações',
  'Gerente de Relacionamento',
  'Superintendente Comercial',
  'Arquiteto de Soluções',
];

export const MODELOS_AVALIACAO = ['Institucional', 'Comunidade'];

export const AREAS = [
  'Tecnologia',
  'Private Banking',
  'Investimentos',
  'Operações',
  'Financeiro',
  'Recursos Humanos',
];

/** Comitês fictícios no formato "código - nome" do GRUPO_RANKING. */
export const GRUPOS_RANKING = [
  { codigo: '100702', nome: 'WMS PRIVATE', area: 'Private Banking' },
  { codigo: '100703', nome: 'WMS INVESTIMENTOS', area: 'Investimentos' },
  { codigo: '100704', nome: 'TECNOLOGIA CORE', area: 'Tecnologia' },
  { codigo: '100705', nome: 'OPERACOES E BACKOFFICE', area: 'Operações' },
];

/** Curva padrão de interpolação da nota: P1..P5 (FPI) -> N1..N5. */
export const CURVA_PADRAO = {
  p1: 0.8,
  p2: 0.95,
  p3: 1.1,
  p4: 1.2,
  p5: 1.35,
  n1: 1,
  n2: 2,
  n3: 2.5,
  n4: 3,
  n5: 4,
};

/**
 * Gerador pseudoaleatório determinístico (mulberry32).
 * Mesma semente => mesma massa, o que torna os testes reproduzíveis.
 */
export function criarGerador(semente = 20260913) {
  let estado = semente >>> 0;

  const proximo = (): number => {
    estado |= 0;
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    proximo,
    inteiro: (min: number, max: number): number => Math.floor(proximo() * (max - min + 1)) + min,
    decimal: (min: number, max: number, casas = 4): number =>
      Number((proximo() * (max - min) + min).toFixed(casas)),
    item: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)],
  };
}

export type Gerador = ReturnType<typeof criarGerador>;
