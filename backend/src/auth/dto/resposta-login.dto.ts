import { ApiProperty } from '@nestjs/swagger';
import { PerfilUsuario } from '../../common/enums';

export class UsuarioLogadoDto {
  @ApiProperty() id: string;
  @ApiProperty() nome: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: PerfilUsuario }) perfil: PerfilUsuario;
}

export class RespostaLoginDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: string;
  @ApiProperty({ example: '8h' }) expiresIn: string;
  @ApiProperty({ type: UsuarioLogadoDto }) usuario: UsuarioLogadoDto;
}
