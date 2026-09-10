import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AcaoAuditoria } from '../../common/enums';

/**
 * Entrada do `AuditService` do frontend.
 *
 * A ação é livre (o Angular usa rótulos próprios, ex.: `UPDATE_DISCRETIONARY`).
 * Quando o rótulo coincide com uma ação conhecida do backend, ele é preservado;
 * caso contrário o registro é gravado como `ACAO_FRONTEND` com o rótulo original
 * em `detalhes.acaoOriginal`.
 *
 * Registros criados por este endpoint são sempre marcados com
 * `origem = FRONTEND`. A auditoria oficial (segurança/rastreabilidade)
 * continua sendo a gerada pelo backend nos próprios services.
 */
export class AuditoriaFrontendDto {
  @ApiProperty({ example: 'UPDATE_DISCRETIONARY' })
  @IsString({ message: 'action é obrigatória' })
  @MaxLength(60)
  action: string;

  @ApiProperty({ example: 'PARTICIPANT' })
  @IsString({ message: 'entity é obrigatória' })
  @MaxLength(60)
  entity: string;

  @ApiPropertyOptional({ example: 'e3f1c0d2-...' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}

/** Converte o rótulo do frontend em uma ação conhecida do backend. */
export function resolverAcaoFrontend(action: string): AcaoAuditoria {
  const conhecidas = Object.values(AcaoAuditoria) as string[];
  return conhecidas.includes(action) ? (action as AcaoAuditoria) : AcaoAuditoria.ACAO_FRONTEND;
}
