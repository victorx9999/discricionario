import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { PaginacaoQueryDto } from '../common/dto';
import { PerfilUsuario } from '../common/enums';
import { AtualizarMotivoDto, CriarMotivoDto } from './dto';
import { MotivosService } from './motivos.service';

@ApiTags('motivos')
@ApiBearerAuth()
@Controller('motivos')
export class MotivosController {
  constructor(private readonly motivosService: MotivosService) {}

  @Get()
  @ApiOperation({ summary: 'Catálogo de motivadores (paginado)' })
  listar(@Query() query: PaginacaoQueryDto) {
    return this.motivosService.listar(query);
  }

  @Get('ativos')
  @ApiOperation({ summary: 'Motivadores ativos — opções do campo "Motivador principal"' })
  ativos() {
    return this.motivosService.listarAtivos();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um motivador' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.motivosService.buscarPorId(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Cria um motivador' })
  criar(
    @Body() dto: CriarMotivoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.motivosService.criar(dto, usuario, contexto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Atualiza um motivador (inclusive seu limite de FD)' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarMotivoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.motivosService.atualizar(id, dto, usuario, contexto);
  }

  @Delete(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove logicamente um motivador' })
  remover(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.motivosService.remover(id, usuario, contexto);
  }

  @Patch(':id/restore')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Restaura um motivador removido' })
  restaurar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ) {
    return this.motivosService.restaurar(id, usuario, contexto);
  }
}
