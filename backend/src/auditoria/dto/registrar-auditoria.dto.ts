import { AcaoAuditoria, OrigemAuditoria } from '../../common/enums';

/** Identificação mínima de quem executou a ação. */
export interface UsuarioAuditoria {
  id?: string | null;
  email?: string | null;
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
  entidade: string;
  entidadeId?: string | null;
  usuario?: UsuarioAuditoria | null;
  comiteId?: string | null;
  participanteId?: string | null;
  campoAlterado?: string | null;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  justificativa?: string | null;
  detalhes?: Record<string, unknown> | null;
  origem?: OrigemAuditoria;
  contexto?: ContextoAuditoria | null;
}
