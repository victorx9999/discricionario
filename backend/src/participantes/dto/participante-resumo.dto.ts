import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Participante } from '../entities/participante.entity';

/**
 * Projeção de participante devolvida pela API.
 * A entidade nunca é exposta diretamente nos contratos REST.
 */
export class ParticipanteResumoDto {
  @ApiProperty() id: string;
  @ApiProperty() funcional: string;
  @ApiProperty() nome: string;
  @ApiPropertyOptional() cargo: string | null;
  @ApiPropertyOptional() nivelCargo: string | null;
  @ApiPropertyOptional() modeloAvaliacao: string | null;
  @ApiPropertyOptional() area: string | null;
  @ApiPropertyOptional() areaOrigem: string | null;
  @ApiProperty() fpi: number;
  @ApiProperty() fpiFinal: number;
  @ApiProperty() fbpa: number;
  @ApiProperty() fd: number;
  @ApiProperty() valorBase: number;
  @ApiProperty({ description: 'PR inicial da área atual (sem acréscimo)' }) valorPrI: number;
  @ApiProperty({ description: 'PR final da área atual (sem acréscimo)' }) valorPrF: number;
  @ApiProperty({ description: 'Base do pool (área atual)' }) vlrTeorico: number;
  @ApiProperty() ativo: boolean;

  static de(participante: Participante): ParticipanteResumoDto {
    return {
      id: participante.id,
      funcional: participante.funcional,
      nome: participante.nome,
      cargo: participante.cargo,
      nivelCargo: participante.nivelCargo,
      modeloAvaliacao: participante.modeloAvaliacao,
      area: participante.area,
      areaOrigem: participante.areaOrigem,
      fpi: Number(participante.fpi),
      fpiFinal: Number(participante.fpiFinal),
      fbpa: Number(participante.fbpa),
      fd: Number(participante.fd),
      valorBase: Number(participante.valorBase),
      valorPrI: Number(participante.valorPrI),
      valorPrF: Number(participante.valorPrF),
      vlrTeorico: Number(participante.vlrTeorico),
      ativo: participante.ativo,
    };
  }
}
