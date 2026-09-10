import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { PerfilUsuario } from '../common/enums';
import { ListarParticipantesQueryDto } from '../participantes/dto';
import { AtualizarGrupoDto, CriarGrupoDto, GerenciarParticipantesDto, ListarGruposQueryDto } from './dto';
import { GruposService } from './grupos.service';

@ApiTags('grupos')
@ApiBearerAuth()
@Controller('grupos')
export class GruposController {
  constructor(private readonly gruposService: GruposService) {}

  @Get()
  @ApiOperation({ summary: 'Lista grupos com paginação, busca e filtros' })
  listar(@Query() query: ListarGruposQueryDto) {
    return this.gruposService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um grupo com responsáveis e total de participantes' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.gruposService.buscarPorId(id);
  }

  @Get(':id/participantes')
  @ApiOperation({ summary: 'Participantes do grupo (paginado, com busca e filtros)' })
  participantes(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListarParticipantesQueryDto) {
    return this.gruposService.listarParticipantes(id, query);
  }

  @Get(':id/pool')
  @ApiOperation({ summary: 'Pool do grupo (1% do VLRTEORICO total dos participantes)' })
  pool(@Param('id', ParseUUIDPipe) id: string) {
    return this.gruposService.calcularPool(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Cria um grupo e associa os participantes selecionados' })
  criar(
    @Body() dto: CriarGrupoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.gruposService.criar(dto, usuario, contexto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Atualiza um grupo' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarGrupoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.gruposService.atualizar(id, dto, usuario, contexto);
  }

  @Delete(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um grupo sem comitês vinculados' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.gruposService.remover(id, usuario, contexto);
  }

  @Post(':id/participantes')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Adiciona participantes selecionados ao grupo' })
  adicionarParticipantes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GerenciarParticipantesDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.gruposService.adicionarParticipantes(id, dto.participanteIds, usuario, contexto);
  }

  @Delete(':id/participantes')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Remove participantes do grupo' })
  removerParticipantes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GerenciarParticipantesDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.gruposService.removerParticipantes(id, dto.participanteIds, usuario, contexto);
  }
}
