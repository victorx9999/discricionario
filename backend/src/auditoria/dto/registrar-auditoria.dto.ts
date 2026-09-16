import { AcaoAuditoria, OperacaoAuditoria, OrigemAuditoria } from '../../common/enums';

/** Identificação mínima de quem executou a ação. */
export interface UsuarioAuditoria {
  id?: string | null;
  email?: string | null;
  nome?: string | null;
}

/** Contexto de requisição opcional (IP / user-agent). */
export interface ContextoAuditoria {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Payload interno usado pelos services ao chamar o `AuditoriaService`.
 * Não é um DTO de entrada HTTP — para isso existe `AuditoriaFrontendDto`.
 */
export interface RegistrarAuditoriaDto {
  acao: AcaoAuditoria;
  /** INSERT / UPDATE / SOFT_DELETE / RESTORE — conforme o modelo de dados. */
  operacao?: OperacaoAuditoria;
  entidade: string;
  entidadeId?: string | null;
  /** Ciclo (ano-base) em que a ação aconteceu. */
  cicloId?: string | null;
  comiteId?: string | null;
  participanteId?: string | null;
  usuario?: UsuarioAuditoria | null;
  campoAlterado?: string | null;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  justificativa?: string | null;
  detalhes?: Record<string, unknown> | null;
  origem?: OrigemAuditoria;
  contexto?: ContextoAuditoria | null;
}
