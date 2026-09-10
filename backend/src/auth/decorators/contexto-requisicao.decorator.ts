import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { ContextoAuditoria } from '../../auditoria/dto/registrar-auditoria.dto';

/** Extrai IP e user-agent da request para enriquecer a auditoria. */
export const ContextoRequisicao = createParamDecorator(
  (_dados: unknown, ctx: ExecutionContext): ContextoAuditoria => {
    const request = ctx.switchToHttp().getRequest();
    return {
      ip: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: request.headers?.['user-agent'] ?? null,
    };
  },
);
