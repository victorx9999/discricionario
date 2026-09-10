import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfiguracaoApp } from '../../config/configuracao';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { UsuarioAutenticado } from '../decorators/usuario-atual.decorator';

export interface PayloadJwt {
  sub: string;
  email: string;
  nome: string;
  perfil: UsuarioAutenticado['perfil'];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usuariosService: UsuariosService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<ConfiguracaoApp['jwt']>('jwt').segredo,
    });
  }

  /** Revalida o usuário no banco a cada requisição (bloqueio surte efeito imediato). */
  async validate(payload: PayloadJwt): Promise<UsuarioAutenticado> {
    const usuario = await this.usuariosService.buscarPorId(payload.sub).catch(() => null);

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo ou inexistente');
    }

    return { id: usuario.id, email: usuario.email, nome: usuario.nome, perfil: usuario.perfil };
  }
}
