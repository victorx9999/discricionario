import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusAnalise } from '../../common/enums';
import { ResultadoPool } from '../services/calculo.service';
import { LinhaResumo } from '../services/resumo.service';

export class DiscricionarioDto {
  @ApiProperty() id: string;
  @ApiProperty() analiseId: string;
  @ApiProperty() comiteId: string;
  @ApiProperty() participanteId: string;
  @ApiProperty({ description: 'FD aplicado (decimal)' }) valorFd: number;
  @ApiProperty({ description: 'FD em pontos percentuais', example: '+7pp' }) valorFdPp: string;
  @ApiPropertyOptional() avaliacaoComportamentalId: string | null;
  @ApiPropertyOptional() avaliacaoComportamentalCodigo: string | null;
  @ApiPropertyOptional() justificativa: string | null;
  @ApiProperty() fpiFinalCalculado: number;
  @ApiProperty() valorPrICalculado: number;
  @ApiProperty() valorPrFCalculado: number;
  @ApiProperty({ description: 'PR final - PR inicial' }) impactoFinanceiro: number;
  @ApiProperty({ enum: StatusAnalise }) statusAnalise: StatusAnalise;
  @ApiProperty() atualizadoEm: Date;
}

/** Próxima análise, devolvida quando `avancarParaProximo = true`. */
export class ProximaAnaliseDto {
  @ApiProperty() analiseId: string;
  @ApiProperty() participanteId: string;
  @ApiProperty() nome: string;
  @ApiProperty() funcional: string;
  @ApiProperty() ordem: number;
}

/**
 * Resposta do salvamento: já devolve pool e resumo atualizados para que o
 * frontend apenas exiba os números, sem recalcular nada.
 */
export class RespostaDiscricionarioDto {
  @ApiProperty({ type: DiscricionarioDto }) discricionario: DiscricionarioDto;
  @ApiProperty() pool: ResultadoPool;
  @ApiProperty({ isArray: true }) resumoPorNivelCargo: LinhaResumo[];
  @ApiProperty({ isArray: true }) resumoPorModeloAvaliacao: LinhaResumo[];
  @ApiPropertyOptional({ type: ProximaAnaliseDto }) proximaAnalise?: ProximaAnaliseDto | null;
}
