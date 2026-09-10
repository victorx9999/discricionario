import { ApiProperty } from '@nestjs/swagger';
import { ModoProcessamento, StatusImportacao, TipoBase } from '../../common/enums';

/** Detalhe de um registro inválido devolvido ao usuário. */
export class ErroUploadDto {
  @ApiProperty() linha: number;
  @ApiProperty({ required: false }) coluna?: string;
  @ApiProperty({ required: false }) valor?: string;
  @ApiProperty() mensagem: string;
}

/** Resposta do POST /uploads. */
export class ResultadoUploadDto {
  @ApiProperty() importacaoId: string;
  @ApiProperty({ enum: TipoBase }) tipoBase: TipoBase;
  @ApiProperty({ enum: ModoProcessamento }) modo: ModoProcessamento;
  @ApiProperty({ enum: StatusImportacao }) status: StatusImportacao;
  @ApiProperty() nomeArquivo: string;
  @ApiProperty({ description: 'Linhas de dados encontradas no arquivo' }) totalRegistros: number;
  @ApiProperty({ description: 'Registros válidos efetivamente gravados' }) registrosProcessados: number;
  @ApiProperty() registrosInseridos: number;
  @ApiProperty() registrosAtualizados: number;
  @ApiProperty() registrosRemovidos: number;
  @ApiProperty() registrosComErro: number;
  @ApiProperty({ type: [ErroUploadDto], description: 'Primeiros 100 erros encontrados' })
  erros: ErroUploadDto[];
  @ApiProperty({ type: Object, required: false }) resumo?: Record<string, unknown>;
  @ApiProperty({ type: [String], description: 'Colunas do arquivo que não foram utilizadas' })
  colunasIgnoradas: string[];
}
