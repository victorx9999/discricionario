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
  @ApiProperty({ example: 'COMITE_ABERTO' })
  @IsString({ message: 'acao é obrigatória' })
  @MaxLength(60)
  acao: string;

  @ApiProperty({ example: 'COMITE' })
  @IsString({ message: 'entidade é obrigatória' })
  @MaxLength(60)
  entidade: string;

  @ApiPropertyOptional({ example: 'e3f1c0d2-...' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entidadeId?: string;

  @ApiPropertyOptional({ example: 'e3f1c0d2-...' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  comiteId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  detalhes?: Record<string, unknown>;
}

/** Converte o rótulo do frontend em uma ação conhecida do backend. */
export function resolverAcaoFrontend(acao: string): AcaoAuditoria {
  const conhecidas = Object.values(AcaoAuditoria) as string[];
  return conhecidas.includes(acao) ? (acao as AcaoAuditoria) : AcaoAuditoria.ACAO_FRONTEND;
}
