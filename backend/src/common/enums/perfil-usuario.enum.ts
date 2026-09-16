/** Perfis que operam o processo (seção 2 da documentação). */
export enum PerfilUsuario {
  /** Gerencia a ferramenta, faz a carga das bases, administra usuários e premissas. */
  ADMIN = 'ADMIN',
  /** Cria e gerencia os comitês, cadastra ATAs, acompanha a consolidação. */
  ATENDIMENTO = 'ATENDIMENTO',
  /** Participa dos comitês sob sua responsabilidade e lança o discricionário. */
  CONSULTORIA = 'CONSULTORIA',
}
