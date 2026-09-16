import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { PerfilUsuario } from '../common/enums';
import { CiclosService } from './ciclos.service';
import { AtualizarPremissasDto, CriarCicloDto, ListarCiclosQueryDto } from './dto';

@ApiTags('ciclos')
@ApiBearerAuth()
@Controller('ciclos')
export class CiclosController {
  constructor(private readonly ciclosService: CiclosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os ciclos (anos-base), do mais recente para o mais antigo' })
  listar(@Query() query: ListarCiclosQueryDto) {
    return this.ciclosService.listar(query);
  }

  @Get('anos')
  @ApiOperation({
    summary: 'Anos disponíveis para o seletor de ciclo (ano, status e qual está ativo)',
  })
  anos() {
    return this.ciclosService.listarAnos();
  }

  @Get('ativo')
  @ApiOperation({ summary: 'Ciclo ativo — o padrão de todos os endpoints quando ?ciclo é omitido' })
  ativo() {
    return this.ciclosService.buscarAtivo();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um ciclo com suas premissas vigentes' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.ciclosService.buscarPorId(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Abre um novo ciclo, herdando as premissas do ano anterior' })
  criar(
    @Body() dto: CriarCicloDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.ciclosService.criar(dto, usuario, contexto);
  }

  @Patch(':id/ativar')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Torna este o ciclo ativo (apenas um por vez)' })
  ativar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.ciclosService.ativar(id, usuario, contexto);
  }

  @Patch(':id/fechar')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Fecha o ciclo: vira histórico somente leitura' })
  fechar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.ciclosService.fechar(id, usuario, contexto);
  }

  @Patch(':id/reabrir')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Reabre um ciclo fechado' })
  reabrir(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.ciclosService.reabrir(id, usuario, contexto);
  }

  @Patch(':id/premissas')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Atualiza as premissas vigentes do ciclo (seção 10)' })
  premissas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarPremissasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.ciclosService.atualizarPremissas(id, dto, usuario, contexto);
  }
}
