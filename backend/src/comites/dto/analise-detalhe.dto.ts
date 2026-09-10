import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusAnalise } from '../../common/enums';
import { DiscricionarioDto } from '../../discricionario/dto';
import { ParticipanteDetalheDto } from '../../participantes/dto';

/** Linha da tabela de navegação do comitê. */
export class AnaliseResumoDto {
  @ApiProperty() analiseId: string;
  @ApiProperty() ordem: number;
  @ApiProperty({ enum: StatusAnalise }) status: StatusAnalise;
  @ApiProperty() participanteId: string;
  @ApiProperty() funcional: string;
  @ApiProperty() nome: string;
  @ApiPropertyOptional() cargo: string | null;
  @ApiPropertyOptional() nivelCargo: string | null;
  @ApiPropertyOptional() modeloAvaliacao: string | null;
  @ApiPropertyOptional() area: string | null;
  @ApiProperty() vlrTeorico: number;
  @ApiProperty({ description: 'VL_PR_I com acréscimos (visão anual)' }) valorPrIAnual: number;
  @ApiProperty({ description: 'VL_PR_F com acréscimos (visão anual)' }) valorPrFAnual: number;
  @ApiPropertyOptional({ description: 'FD lançado, quando houver' }) valorFd: number | null;
  @ApiPropertyOptional() impactoFinanceiro: number | null;
}

/** Tela de análise de um participante dentro do comitê. */
export class AnaliseDetalheDto {
  @ApiProperty() analiseId: string;
  @ApiProperty() comiteId: string;
  @ApiProperty() ordem: number;
  @ApiProperty({ description: 'Total de participantes na navegação' }) totalParticipantes: number;
  @ApiProperty({ enum: StatusAnalise }) status: StatusAnalise;
  @ApiProperty({ type: ParticipanteDetalheDto }) participante: ParticipanteDetalheDto;
  @ApiPropertyOptional({ type: DiscricionarioDto }) discricionario: DiscricionarioDto | null;
  @ApiPropertyOptional() analiseAnteriorId: string | null;
  @ApiPropertyOptional() proximaAnaliseId: string | null;
}
