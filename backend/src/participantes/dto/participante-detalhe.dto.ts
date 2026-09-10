import { ApiProperty } from '@nestjs/swagger';
import { ParticipanteResumoDto } from './participante-resumo.dto';

export class AcrescimoDto {
  @ApiProperty() id: string;
  @ApiProperty() areaOrigem: string;
  @ApiProperty() valorAcrescimoPrI: number;
  @ApiProperty() valorAcrescimoPrF: number;
  @ApiProperty({ required: false }) observacao: string | null;
}

/**
 * Participante com a visão anual.
 *
 * `valorPrIAnual` / `valorPrFAnual` somam os acréscimos das outras áreas —
 * é o que o comitê enxerga. O pool continua usando `vlrTeorico` da área atual.
 */
export class ParticipanteDetalheDto extends ParticipanteResumoDto {
  @ApiProperty({ type: [AcrescimoDto] }) acrescimos: AcrescimoDto[];
  @ApiProperty({ description: 'VL_PR_I + acréscimos das demais áreas' }) valorPrIAnual: number;
  @ApiProperty({ description: 'VL_PR_F + acréscimos das demais áreas' }) valorPrFAnual: number;
  @ApiProperty() totalAcrescimoPrI: number;
  @ApiProperty() totalAcrescimoPrF: number;
}
