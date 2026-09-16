import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Linha da Tabela de Participantes, já com os campos calculados.
 * As chaves batem com o catálogo de colunas (`/participantes/colunas`), que é
 * o que o layout do comitê referencia.
 */
export class ParticipanteTabelaDto {
  @ApiProperty() id: string;
  @ApiProperty() emplid: string;
  @ApiProperty() nome: string;
  @ApiPropertyOptional() nationalId: string | null;
  @ApiPropertyOptional() dataAdmissao: Date | null;

  @ApiPropertyOptional() xlatlongname: string | null;
  @ApiPropertyOptional() descrJobcode: string | null;
  @ApiPropertyOptional() managerLevel: number | null;
  @ApiPropertyOptional() area: string | null;
  @ApiPropertyOptional() areaOrigem: string | null;
  @ApiPropertyOptional() descrDeptid: string | null;
  @ApiPropertyOptional() descrCompany: string | null;
  @ApiPropertyOptional() modeloAvaliacao: string | null;
  @ApiPropertyOptional() descricaoSubmodelo: string | null;

  @ApiProperty() nota: number;
  @ApiProperty() notaAnoAnterior: number;
  @ApiProperty() fpi: number;
  @ApiProperty() fpiFinal: number;
  @ApiProperty() fpba: number;
  @ApiPropertyOptional() notaPosDiscricionario: number | null;

  @ApiProperty() valorBase: number;
  @ApiProperty() vbAnoAnterior: number;
  @ApiProperty() vlBaseMes: number;
  @ApiProperty() vlPrI: number;
  @ApiProperty() vlPrF: number;
  @ApiProperty() vlrTeorico: number;
  @ApiProperty() prAnoAnterior2: number;
  @ApiProperty({ description: 'VL_PR_I + acréscimos elegíveis' }) prSemDiscricionario: number;
  @ApiProperty({ description: 'VL_PR_F + acréscimos com o mesmo FD' }) prPosDiscricionario: number;

  @ApiProperty({ description: 'FD em decimal' }) fd: number;
  @ApiProperty({ description: 'FD em pontos percentuais', example: '+5pp' }) fdPp: string;
  @ApiPropertyOptional() codMotivador: number | null;
  @ApiPropertyOptional() motivoDiscricionario: string | null;
  @ApiPropertyOptional() observacaoPoscomite: string | null;
  @ApiProperty({ description: 'PR pós disc. − PR sem disc.' }) diferencaDiscricionario: number;
  @ApiProperty() fdForaLimite: boolean;
  @ApiProperty({ description: 'FD lançado sem motivador ou sem justificativa' }) pendente: boolean;

  @ApiPropertyOptional() percentualRv: number | null;
  @ApiPropertyOptional() percentualTc: number | null;
  @ApiPropertyOptional() deltaTcMaisSocios: number | null;

  @ApiProperty() totalCash: number;
  @ApiProperty() totalCashAnoAnterior2: number;
  @ApiProperty() tcMaisSociosAtual: number;
  @ApiProperty() tcMaisSociosAnterior: number;
  @ApiProperty() socioAno: boolean;

  @ApiPropertyOptional() grupoRanking: string | null;
  @ApiPropertyOptional() statusContrato: string | null;
  @ApiPropertyOptional() idpool: string | null;
  @ApiPropertyOptional() idcurva: string | null;
  @ApiPropertyOptional() comiteId: string | null;

  @ApiProperty({ description: 'Acréscimos elegíveis somados ao PR' })
  acrescimos: Array<{
    id: string;
    area: string | null;
    vlrTeorico: number;
    vlPrI: number;
    elegivel: boolean;
  }>;
}
