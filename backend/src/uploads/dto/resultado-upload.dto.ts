import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModoCarga, StatusImportacao, TipoBase } from '../../common/enums';

export class ErroUploadDto {
  @ApiProperty() linha: number;
  @ApiPropertyOptional() coluna?: string;
  @ApiPropertyOptional() valor?: string;
  @ApiProperty() mensagem: string;
}

/**
 * Pré-visualização (seção 6.1): mostra colunas reconhecidas, ignoradas,
 * quantos registros são novos e quantos serão atualizados — antes de confirmar.
 */
export class PreviaUploadDto {
  @ApiProperty() ciclo: number;
  @ApiProperty({ enum: TipoBase }) tipoBase: TipoBase;
  @ApiProperty({ enum: ModoCarga }) modo: ModoCarga;
  @ApiProperty() nomeArquivo: string;
  @ApiProperty({ description: 'Delimitador detectado no arquivo' }) delimitador: string;
  @ApiProperty({ type: [String] }) colunasReconhecidas: string[];
  @ApiProperty({ type: [String] }) colunasIgnoradas: string[];
  @ApiProperty({ type: [String] }) colunasObrigatoriasAusentes: string[];
  @ApiProperty() totalRegistros: number;
  @ApiProperty() registrosValidos: number;
  @ApiProperty() registrosComErro: number;
  @ApiProperty() novos: number;
  @ApiProperty() atualizados: number;
  @ApiProperty({ type: [ErroUploadDto] }) erros: ErroUploadDto[];
  @ApiProperty({ type: [Object], description: 'Primeiras linhas já convertidas, para conferência visual' })
  amostra: Array<Record<string, unknown>>;
  @ApiPropertyOptional({ description: 'O que a carga COMPLETA vai apagar neste ciclo' })
  impactoDoReinicio?: Record<string, number> | null;
}

export class ResultadoUploadDto {
  @ApiProperty() importacaoId: string;
  @ApiProperty() ciclo: number;
  @ApiProperty({ enum: TipoBase }) tipoBase: TipoBase;
  @ApiProperty({ enum: ModoCarga }) modo: ModoCarga;
  @ApiProperty({ enum: StatusImportacao }) status: StatusImportacao;
  @ApiProperty() nomeArquivo: string;
  @ApiProperty() totalRegistros: number;
  @ApiProperty() registrosProcessados: number;
  @ApiProperty() registrosInseridos: number;
  @ApiProperty() registrosAtualizados: number;
  @ApiProperty() registrosRemovidos: number;
  @ApiProperty() registrosComErro: number;
  @ApiProperty({ type: [ErroUploadDto], description: 'Primeiros 100 erros' }) erros: ErroUploadDto[];
  @ApiPropertyOptional({ type: Object }) resumo?: Record<string, unknown>;
  @ApiProperty({ type: [String] }) colunasIgnoradas: string[];
}
