import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ModoCarga, TipoBase } from '../../common/enums';

export class ProcessarUploadDto {
  @ApiProperty({
    enum: TipoBase,
    description: 'PRINCIPAL = TBPR_Simuladores; ACRESCIMO = TBPR_Simuladores_Acres',
  })
  @IsEnum(TipoBase, { message: 'tipoBase deve ser PRINCIPAL ou ACRESCIMO' })
  tipoBase: TipoBase;

  @ApiPropertyOptional({
    enum: ModoCarga,
    default: ModoCarga.PARCIAL,
    description:
      'COMPLETA reinicia o ciclo alvo (apaga comitês, ATAs e discricionários DAQUELE ano); ' +
      'PARCIAL atualiza preservando as decisões. A base de acréscimo é sempre recarregada por inteiro.',
  })
  @IsOptional()
  @IsEnum(ModoCarga, { message: 'modo deve ser COMPLETA ou PARCIAL' })
  modo?: ModoCarga = ModoCarga.PARCIAL;

  @ApiPropertyOptional({
    example: 2027,
    description: 'Ano do ciclo que receberá a carga. Quando omitido, usa o ciclo ativo.',
  })
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt({ message: 'ciclo deve ser o ano (ex.: 2027)' })
  @Min(2000)
  @Max(2999)
  ciclo?: number;

  @ApiPropertyOptional({
    default: true,
    description:
      'Cria os comitês a partir do GRUPO_RANKING da base e vincula os participantes ainda sem comitê.',
  })
  @IsOptional()
  @Transform(({ value }) => value !== false && value !== 'false')
  @IsBoolean()
  vincularPorGrupoRanking?: boolean = true;

  @ApiPropertyOptional({
    default: false,
    description: 'Confirmação explícita exigida para a carga COMPLETA, que reinicia o ciclo.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmarReinicioDoCiclo?: boolean = false;
}
