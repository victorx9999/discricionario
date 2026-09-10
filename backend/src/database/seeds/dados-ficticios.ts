/**
 * Fontes de dados FICTÍCIOS usados apenas para desenvolvimento e testes.
 * Nenhum nome, matrícula ou valor aqui corresponde a pessoas ou remunerações reais.
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

export const CARGOS = [
  'Analista de Sistemas',
  'Analista Financeiro',
  'Analista de RH',
  'Engenheiro de Software',
  'Cientista de Dados',
  'Especialista de Produto',
  'Coordenador de Operações',
  'Gerente de Projetos',
  'Consultor de Negócios',
  'Arquiteto de Soluções',
];

export const NIVEIS_CARGO = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenador', 'Gerente'];

export const MODELOS_AVALIACAO = ['Corporativo', 'Comercial', 'Executivo', 'Operações'];

export const AREAS = [
  'Tecnologia',
  'Financeiro',
  'Recursos Humanos',
  'Comercial',
  'Operações',
  'Jurídico',
  'Marketing',
];

/**
 * Gerador pseudoaleatório determinístico (mulberry32).
 * Mesma semente => mesma massa de dados, o que torna os testes reproduzíveis.
 */
export function criarGerador(semente = 20260910) {
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
    /** Inteiro entre min e max (inclusive). */
    inteiro: (min: number, max: number): number => Math.floor(proximo() * (max - min + 1)) + min,
    /** Decimal entre min e max com N casas. */
    decimal: (min: number, max: number, casas = 4): number =>
      Number((proximo() * (max - min) + min).toFixed(casas)),
    /** Item aleatório de uma lista. */
    item: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)],
  };
}

export type Gerador = ReturnType<typeof criarGerador>;
