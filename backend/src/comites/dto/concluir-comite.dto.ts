import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class ConcluirComiteDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Confirma a conclusão mesmo com o pool excedido. Só é necessário quando a premissa do ciclo permite lançar acima do pool.',
  })
  @IsOptional()
  @IsBoolean()
  confirmarPoolExcedido?: boolean;
}
