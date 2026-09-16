import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { PerfilUsuario } from '../common/enums';
import { LancarDiscricionarioDto, ListarParticipantesQueryDto } from './dto';
import { ParticipantesService } from './participantes.service';

@ApiTags('participantes')
@ApiBearerAuth()
@Controller('participantes')
export class ParticipantesController {
  constructor(private readonly participantesService: ParticipantesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Tabela de participantes do ciclo, paginada, com busca, filtros dinâmicos e campos calculados',
  })
  listar(@Query() query: ListarParticipantesQueryDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.participantesService.listar(query, usuario);
  }

  @Get('colunas')
  @ApiOperation({
    summary: 'Catálogo das colunas disponíveis para a tabela customizável do comitê',
  })
  colunas() {
    return this.participantesService.listarColunasDisponiveis();
  }

  @Get('filtros')
  @ApiQuery({ name: 'ciclo', required: false, example: 2026 })
  @ApiOperation({ summary: 'Valores distintos para popular os filtros das tabelas' })
  filtros(@Query('ciclo') ciclo?: string) {
    return this.participantesService.listarOpcoesFiltro(ciclo ? Number(ciclo) : undefined);
  }

  @Get('ids')
  @ApiOperation({ summary: 'Somente os IDs que atendem ao filtro (suporte ao "selecionar todos")' })
  ids(@Query() query: ListarParticipantesQueryDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.participantesService.listarIds(query, usuario);
  }

  @Get('pesquisa')
  @ApiQuery({ name: 'termo', required: true, description: 'Nome ou funcional' })
  @ApiQuery({ name: 'ciclo', required: false, example: 2026 })
  @ApiOperation({
    summary: 'Pesquisa funcional: localiza o colaborador e mostra sua situação no comitê',
  })
  pesquisa(
    @Query('termo') termo: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('ciclo') ciclo?: string,
  ) {
    return this.participantesService.pesquisarFuncional(
      termo ?? '',
      ciclo ? Number(ciclo) : undefined,
      usuario,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um participante com acréscimos e campos calculados' })
  buscar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.participantesService.detalhar(id, usuario);
  }

  @Get(':id/graficos')
  @ApiOperation({
    summary: 'Séries do participante para os gráficos de RV, Total Cash e TC + P.Sócios',
  })
  graficos(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.participantesService.graficos(id, usuario);
  }

  @Patch(':id/discricionario')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({
    summary:
      'Lança ou edita o FD do participante: valida limite e pool, calcula, persiste e audita',
  })
  lancarDiscricionario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LancarDiscricionarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.participantesService.lancarDiscricionario(id, dto, usuario, contexto);
  }

  @Delete(':id/discricionario')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Zera o discricionário, removendo motivador e justificativa' })
  removerDiscricionario(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.participantesService.removerDiscricionario(id, usuario, contexto);
  }
}
