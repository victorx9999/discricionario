import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PerfilUsuario } from '../../common/enums';

export class CriarUsuarioDto {
  @ApiProperty({ example: 'Maria Consultora' })
  @IsString({ message: 'nome é obrigatório' })
  @MinLength(3, { message: 'nome deve ter ao menos 3 caracteres' })
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome: string;

  @ApiProperty({ example: 'maria@discricionario.local' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'e-mail inválido' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Senha@123', minLength: 6 })
  @IsString({ message: 'senha é obrigatória' })
  @MinLength(6, { message: 'a senha deve ter ao menos 6 caracteres' })
  @MaxLength(100)
  senha: string;

  @ApiPropertyOptional({ enum: PerfilUsuario, default: PerfilUsuario.CONSULTORIA })
  @IsOptional()
  @IsEnum(PerfilUsuario, { message: 'perfil deve ser ADMIN, ATENDIMENTO ou CONSULTORIA' })
  perfil?: PerfilUsuario;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
