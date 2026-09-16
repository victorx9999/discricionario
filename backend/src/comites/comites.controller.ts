import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { ContextoColuna, PerfilUsuario } from '../common/enums';
import { ListarParticipantesQueryDto } from '../participantes/dto';
import { ParticipantesService } from '../participantes/participantes.service';
import { ComitesService } from './comites.service';
import {
  AtualizarComiteDto,
  ConcluirComiteDto,
  CriarComiteDto,
  GerenciarParticipantesDto,
  ListarComitesQueryDto,
  SalvarAtaDto,
  SalvarColunasDto,
} from './dto';
import { AtasService } from './services/atas.service';
import { ColunasComiteService } from './services/colunas.service';

@ApiTags('comites')
@ApiBearerAuth()
@Controller('comites')
export class ComitesController {
  constructor(
    private readonly comitesService: ComitesService,
    private readonly participantesService: ParticipantesService,
    private readonly atasService: AtasService,
    private readonly colunasService: ColunasComiteService,
  ) {}

  // ----------------------------------------------------------------
  // Lista e detalhe
  // ----------------------------------------------------------------

  @Get()
  @ApiOperation({
    summary: 'Lista os comitês do ciclo, respeitando a visibilidade do perfil (?ciclo=2026)',
  })
  listar(@Query() query: ListarComitesQueryDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.comitesService.listar(query, usuario);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha o comitê com responsáveis e ATA' })
  buscar(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.comitesService.buscarPorId(id, usuario);
  }

  // ----------------------------------------------------------------
  // Aba 1 — Avaliação Discricionária
  // ----------------------------------------------------------------

  @Get(':id/participantes')
  @ApiOperation({ summary: 'Tabela de participantes do comitê, com os campos calculados' })
  participantes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListarParticipantesQueryDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    query.comiteId = id;
    return this.participantesService.listar(query, usuario);
  }

  @Get(':id/resumo')
  @ApiOperation({
    summary:
      'Resumo por nível de cargo e modelo (HC Total, HC Máx., Redução, Aumento, HC c/Disc., Checagem), performance ponderada por VB e pool',
  })
  resumo(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.comitesService.resumo(id, usuario);
  }

  @Get(':id/colunas')
  @ApiQuery({
    name: 'contexto',
    required: false,
    enum: ContextoColuna,
    description: 'TABELA (padrão) ou PAINEL. Sem o parâmetro, devolve os dois layouts.',
  })
  @ApiOperation({ summary: 'Layout do comitê: colunas da tabela e campos do painel de análise' })
  async colunas(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('contexto') contexto?: ContextoColuna,
  ) {
    const comite = await this.comitesService.buscarPorId(id, usuario);
    return contexto
      ? this.colunasService.obter(comite.id, contexto)
      : this.colunasService.obterLayout(comite.id);
  }

  @Put(':id/colunas')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Salva o layout da tabela: colunas visíveis, ordem, largura e rótulos' })
  async salvarColunas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalvarColunasDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    const comite = await this.comitesService.buscarPorId(id, usuario);
    return this.colunasService.salvar(comite, dto, usuario, contexto);
  }

  @Delete(':id/colunas')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiQuery({
    name: 'contexto',
    required: false,
    enum: ContextoColuna,
    description: 'Sem o parâmetro, restaura tabela e painel de uma vez.',
  })
  @ApiOperation({ summary: 'Restaura o layout padrão do catálogo' })
  async restaurarColunas(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
    @Query('contexto') contextoColuna?: ContextoColuna,
  ) {
    const comite = await this.comitesService.buscarPorId(id, usuario);
    return this.colunasService.restaurarPadrao(comite, usuario, contexto, contextoColuna);
  }

  // ----------------------------------------------------------------
  // Aba 2 — Distribuição do Pool
  // ----------------------------------------------------------------

  @Get(':id/pool')
  @ApiOperation({
    summary: 'Σ VLR_TEÓRICO, pool disponível (1%), pool consumido, saldo e % de utilização',
  })
  pool(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.comitesService.pool(id, usuario);
  }

  @Get(':id/discricionarios')
  @ApiOperation({ summary: 'Lista nominal dos discricionários lançados no comitê' })
  discricionarios(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListarParticipantesQueryDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ) {
    query.comiteId = id;
    query.discricionario = 'com';
    return this.participantesService.listar(query, usuario);
  }

  // ----------------------------------------------------------------
  // Aba 3 — ATA
  // ----------------------------------------------------------------

  @Get(':id/ata')
  @ApiOperation({ summary: 'ATA do comitê' })
  async ata(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    const comite = await this.comitesService.buscarPorId(id, usuario);
    const ata = await this.atasService.buscarPorComite(comite.id);
    if (!ata) throw new NotFoundException('Este comitê ainda não tem ATA');
    return ata;
  }

  @Put(':id/ata')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Cadastra ou atualiza a ATA (data, horários, observações e presentes)' })
  async salvarAta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalvarAtaDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    const comite = await this.comitesService.buscarPorId(id, usuario);
    return this.atasService.salvar(comite, dto, usuario, contexto);
  }

  // ----------------------------------------------------------------
  // Cadastro e ciclo de vida
  // ----------------------------------------------------------------

  @Post()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Cria o comitê com responsáveis, backups e participantes selecionados' })
  criar(
    @Body() dto: CriarComiteDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.criar(dto, usuario, contexto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Atualiza o comitê' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarComiteDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.atualizar(id, dto, usuario, contexto);
  }

  @Get(':id/pendencias')
  @ApiOperation({ summary: 'O que ainda impede a conclusão do comitê' })
  pendencias(@Param('id', ParseUUIDPipe) id: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.comitesService.pendencias(id, usuario);
  }

  @Patch(':id/concluir')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Conclui o comitê (exige ATA completa e nenhuma pendência)' })
  concluir(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConcluirComiteDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.concluir(id, dto ?? {}, usuario, contexto);
  }

  @Patch(':id/reabrir')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Reabre um comitê concluído para edição' })
  reabrir(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.reabrir(id, usuario, contexto);
  }

  @Post(':id/participantes')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Vincula participantes ao comitê' })
  vincular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GerenciarParticipantesDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.adicionarParticipantes(id, dto.participanteIds, usuario, contexto);
  }

  @Delete(':id/participantes')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @ApiOperation({ summary: 'Desvincula participantes (libera o registro e zera o discricionário)' })
  desvincular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GerenciarParticipantesDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.removerParticipantes(id, dto.participanteIds, usuario, contexto);
  }

  @Delete(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o comitê logicamente e libera seus participantes' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.remover(id, usuario, contexto);
  }

  @Patch(':id/restore')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Restaura um comitê removido' })
  restaurar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.comitesService.restaurar(id, usuario, contexto);
  }
}
