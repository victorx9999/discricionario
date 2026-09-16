import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoRequisicao, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { OrigemAuditoria } from '../common/enums';
import { AuditoriaService } from './auditoria.service';
import { AuditoriaFrontendDto, resolverAcaoFrontend } from './dto/auditoria-frontend.dto';
import { ConsultarAuditoriaQueryDto } from './dto/consultar-auditoria-query.dto';
import { ContextoAuditoria } from './dto/registrar-auditoria.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  @ApiOperation({ summary: 'Consulta paginada dos logs de auditoria' })
  listar(@Query() query: ConsultarAuditoriaQueryDto) {
    return this.auditoriaService.listar(query);
  }

  @Get('comites/:comiteId/participantes/:participanteId')
  @ApiOperation({ summary: 'Histórico de auditoria de um participante dentro de um comitê' })
  historicoParticipante(
    @Param('comiteId', ParseUUIDPipe) comiteId: string,
    @Param('participanteId', ParseUUIDPipe) participanteId: string,
  ) {
    return this.auditoriaService.listarPorParticipanteNoComite(comiteId, participanteId);
  }

  /**
   * Endpoint consumido pelo `AuditService` do frontend.
   * Complementa — não substitui — a auditoria gerada pelo backend.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra uma ação de auditoria originada no frontend' })
  async registrarDoFrontend(
    @Body() dto: AuditoriaFrontendDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    const acao = resolverAcaoFrontend(dto.action);

    const log = await this.auditoriaService.registrar({
      acao,
      entidade: dto.entity,
      entidadeId: dto.entityId ?? null,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { ...(dto.details ?? {}), acaoOriginal: dto.action },
      origem: OrigemAuditoria.FRONTEND,
      contexto,
    });
    return { registrado: Boolean(log), id: log?.id ?? null };
  }
}
