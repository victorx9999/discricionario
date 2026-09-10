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
import { DiscricionarioService } from './discricionario.service';
import {
  AtualizarDiscricionarioDto,
  ListarDiscricionariosQueryDto,
  SalvarDiscricionarioDto,
} from './dto';

@ApiTags('discricionarios')
@ApiBearerAuth()
@Controller('discricionarios')
export class DiscricionarioController {
  constructor(private readonly discricionarioService: DiscricionarioService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os discricionários lançados (paginado)' })
  listar(@Query() query: ListarDiscricionariosQueryDto) {
    return this.discricionarioService.listar(query);
  }

  @Get('avaliacoes-comportamentais')
  @ApiOperation({ summary: 'Opções de avaliação comportamental disponíveis' })
  avaliacoes() {
    return this.discricionarioService.listarAvaliacoesComportamentais();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um discricionário' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.discricionarioService.buscarPorId(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({
    summary:
      'Lança o discricionário de um participante: valida, calcula, persiste, audita e devolve pool e resumo atualizados',
  })
  salvar(
    @Body() dto: SalvarDiscricionarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.discricionarioService.salvar(dto, usuario, contexto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO, PerfilUsuario.CONSULTORIA)
  @ApiOperation({ summary: 'Atualiza um discricionário existente' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarDiscricionarioDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.discricionarioService.atualizar(id, dto, usuario, contexto);
  }

  @Delete(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove o discricionário e devolve a análise para pendente' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.discricionarioService.remover(id, usuario, contexto);
  }
}
