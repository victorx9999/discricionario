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
import { PerfilUsuario, StatusComite } from '../common/enums';
import { ComitesService } from './comites.service';
import {
  AtualizarComiteDto,
  CriarComiteDto,
  ListarAnalisesQueryDto,
  ListarComitesQueryDto,
  NavegacaoQueryDto,
} from './dto';

@ApiTags('comites')
@ApiBearerAuth()
@Controller('comites')
export class ComitesController {
  constructor(private readonly comitesService: ComitesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de comitês' })
  listar(@Query() query: ListarComitesQueryDto) {
    return this.comitesService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um comitê' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.comitesService.buscarPorId(id);
  }

  @Get(':id/participantes')
  @ApiOperation({ summary: 'Tabela de participantes do comitê (paginada, com busca e filtros)' })
  participantes(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListarAnalisesQueryDto) {
    return this.comitesService.listarAnalises(id, query);
  }

  @Get(':id/navegacao')
  @ApiOperation({ summary: 'Navegação: primeiro, anterior, próximo ou último participante' })
  navegar(@Param('id', ParseUUIDPipe) id: string, @Query() query: NavegacaoQueryDto) {
    return this.comitesService.navegar(id, query);
  }

  @Get(':id/participantes/:analiseId')
  @ApiOperation({ summary: 'Dados completos do participante selecionado no comitê' })
  detalharAnalise(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('analiseId', ParseUUIDPipe) analiseId: string,
  ) {
    return this.comitesService.detalharAnalise(id, analiseId);
  }

  @Get(':id/resumo')
  @ApiOperation({ summary: 'Resumo do comitê: pool, consolidação por nível de cargo e por modelo' })
  resumo(@Param('id', ParseUUIDPipe) id: string) {
    return this.comitesService.resumo(id);
  }

  @Get(':id/pool')
  @ApiOperation({ summary: 'Pool do comitê (total, utilizado, disponível e percentual)' })
  pool(@Param('id', ParseUUIDPipe) id: string) {
    return this.comitesService.pool(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Cria o comitê e monta a navegação de participantes' })
  criar(
    @Body() dto: CriarComiteDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.criar(dto, usuario, contexto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Atualiza um comitê' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarComiteDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.atualizar(id, dto, usuario, contexto);
  }

  @Post(':id/finalizar')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Finaliza o comitê (exige todas as análises concluídas)' })
  finalizar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.alterarSituacao(id, StatusComite.FINALIZADO, usuario, contexto);
  }

  @Post(':id/aprovar')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Aprova um comitê finalizado' })
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.alterarSituacao(id, StatusComite.APROVADO, usuario, contexto);
  }

  @Delete(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Exclui um comitê e suas análises' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.remover(id, usuario, contexto);
  }
}
