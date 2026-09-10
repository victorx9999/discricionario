import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@discricionario.local' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Senha@123' })
  @IsString({ message: 'Senha é obrigatória' })
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres' })
  @MaxLength(100)
  senha: string;
}
