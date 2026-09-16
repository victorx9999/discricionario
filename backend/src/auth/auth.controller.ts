import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { AuthService } from './auth.service';
import { ContextoRequisicao, Publico, UsuarioAtual, UsuarioAutenticado } from './decorators';
import { LoginDto } from './dto/login.dto';
import { RespostaLoginDto } from './dto/resposta-login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica o usuário e devolve o token JWT' })
  login(@Body() dto: LoginDto, @ContextoRequisicao() contexto: ContextoAuditoria): Promise<RespostaLoginDto> {
    return this.authService.login(dto, contexto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registra o logout na auditoria' })
  logout(@UsuarioAtual() usuario: UsuarioAutenticado, @ContextoRequisicao() contexto: ContextoAuditoria) {
    return this.authService.logout(usuario, contexto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  eu(@UsuarioAtual() usuario: UsuarioAutenticado): UsuarioAutenticado {
    return usuario;
  }
}
