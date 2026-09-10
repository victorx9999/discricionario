import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { AcaoAuditoria } from '../common/enums';
import { ConfiguracaoApp } from '../config/configuracao';
import { UsuariosService } from '../usuarios/usuarios.service';
import { UsuarioAutenticado } from './decorators/usuario-atual.decorator';
import { LoginDto } from './dto/login.dto';
import { RespostaLoginDto } from './dto/resposta-login.dto';
import { PayloadJwt } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async login(dto: LoginDto, contexto?: ContextoAuditoria): Promise<RespostaLoginDto> {
    const usuario = await this.usuariosService.buscarPorEmailComSenha(dto.email);
    const senhaValida = usuario ? await UsuariosService.conferirSenha(dto.senha, usuario.senhaHash) : false;

    if (!usuario || !senhaValida || !usuario.ativo) {
      await this.auditoriaService.registrar({
        acao: AcaoAuditoria.LOGIN_FALHOU,
        entidade: 'USUARIO',
        entidadeId: usuario?.id ?? null,
        usuario: { id: usuario?.id ?? null, email: dto.email },
        detalhes: { motivo: !usuario ? 'USUARIO_INEXISTENTE' : !usuario.ativo ? 'USUARIO_INATIVO' : 'SENHA_INVALIDA' },
        contexto,
      });
      // Mensagem genérica: não revela se o e-mail existe.
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.usuariosService.registrarAcesso(usuario.id);

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.LOGIN,
      entidade: 'USUARIO',
      entidadeId: usuario.id,
      usuario: { id: usuario.id, email: usuario.email },
      contexto,
    });

    const jwt = this.config.get<ConfiguracaoApp['jwt']>('jwt');
    const payload: PayloadJwt = {
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      perfil: usuario.perfil,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: jwt.expiraEm,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    };
  }

  /**
   * Logout.
   * Com JWT stateless o token é descartado pelo cliente; aqui o que importa
   * é deixar o evento registrado na auditoria.
   */
  async logout(usuario: UsuarioAutenticado, contexto?: ContextoAuditoria): Promise<{ mensagem: string }> {
    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.LOGOUT,
      entidade: 'USUARIO',
      entidadeId: usuario.id,
      usuario: { id: usuario.id, email: usuario.email },
      contexto,
    });
    return { mensagem: 'Logout registrado com sucesso' };
  }
}
