import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfis } from '../auth/decorators';
import { PerfilUsuario } from '../common/enums';
import { AtualizarUsuarioDto, CriarUsuarioDto, ListarUsuariosQueryDto } from './dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuários com paginação e busca' })
  listar(@Query() query: ListarUsuariosQueryDto) {
    return this.usuariosService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um usuário' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.usuariosService.buscarPorId(id);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Cria um usuário' })
  criar(@Body() dto: CriarUsuarioDto) {
    return this.usuariosService.criar(dto);
  }

  @Put(':id')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Atualiza um usuário' })
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarUsuarioDto) {
    return this.usuariosService.atualizar(id, dto);
  }
}
