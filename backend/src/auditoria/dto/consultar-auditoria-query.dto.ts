import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto';
import { AcaoAuditoria, OperacaoAuditoria, OrigemAuditoria } from '../../common/enums';

export class ConsultarAuditoriaQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ enum: AcaoAuditoria })
  @IsOptional()
  @IsEnum(AcaoAuditoria, { message: 'acao inválida' })
  acao?: AcaoAuditoria;

  @ApiPropertyOptional({ enum: OperacaoAuditoria })
  @IsOptional()
  @IsEnum(OperacaoAuditoria)
  operacao?: OperacaoAuditoria;

  @ApiPropertyOptional({ description: 'Nome lógico da entidade (COMITE, PARTICIPANTE, ...)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entidade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entidadeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'usuarioId deve ser um UUID' })
  usuarioId?: string;

  @ApiPropertyOptional({ description: 'Filtra pelo ciclo (id). Use ?ciclo=2026 para filtrar pelo ano.' })
  @IsOptional()
  @IsUUID('4', { message: 'cicloId deve ser um UUID' })
  cicloId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'comiteId deve ser um UUID' })
  comiteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4', { message: 'participanteId deve ser um UUID' })
  participanteId?: string;

  @ApiPropertyOptional({ enum: OrigemAuditoria })
  @IsOptional()
  @IsEnum(OrigemAuditoria)
  origem?: OrigemAuditoria;

  @ApiPropertyOptional({ description: 'Data inicial (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'dataInicio deve ser uma data ISO válida' })
  dataInicio?: string;

  @ApiPropertyOptional({ description: 'Data final (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'dataFim deve ser uma data ISO válida' })
  dataFim?: string;
}
