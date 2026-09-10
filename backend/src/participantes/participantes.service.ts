import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { ResultadoPaginado } from '../common/dto';
import { resolverDirecao, resolverOrdenacao } from '../common/utils';
import { CalculoService } from '../discricionario/services/calculo.service';
import {
  ListarParticipantesQueryDto,
  ParticipanteDetalheDto,
  ParticipanteResumoDto,
} from './dto';
import { AcrescimoParticipante } from './entities/acrescimo-participante.entity';
import { Participante } from './entities/participante.entity';

const CAMPOS_ORDENACAO = {
  nome: 'participante.nome',
  funcional: 'participante.funcional',
  cargo: 'participante.cargo',
  nivelCargo: 'participante.nivelCargo',
  area: 'participante.area',
  modeloAvaliacao: 'participante.modeloAvaliacao',
  valorBase: 'participante.valorBase',
  valorPrI: 'participante.valorPrI',
  valorPrF: 'participante.valorPrF',
  vlrTeorico: 'participante.vlrTeorico',
  fpi: 'participante.fpi',
  fpiFinal: 'participante.fpiFinal',
  criadoEm: 'participante.criadoEm',
};

@Injectable()
export class ParticipantesService {
  constructor(
    @InjectRepository(Participante)
    private readonly repositorio: Repository<Participante>,
    @InjectRepository(AcrescimoParticipante)
    private readonly acrescimos: Repository<AcrescimoParticipante>,
    private readonly calculoService: CalculoService,
  ) {}

  /** Listagem paginada — é a mesma consulta usada na seleção de participantes do grupo. */
  async listar(query: ListarParticipantesQueryDto): Promise<ResultadoPaginado<ParticipanteResumoDto>> {
    const qb = this.montarQuery(query);

    qb.orderBy(resolverOrdenacao(query.sortBy, CAMPOS_ORDENACAO, 'nome'), resolverDirecao(query.sortOrder))
      .skip(query.skip)
      .take(query.take);

    const [participantes, total] = await qb.getManyAndCount();

    return new ResultadoPaginado(
      participantes.map(ParticipanteResumoDto.de),
      total,
      query.page ?? 1,
      query.limit ?? 50,
    );
  }

  /**
   * Devolve apenas os IDs que satisfazem o filtro.
   * É o que sustenta o "selecionar todos" da tela de grupo sem trafegar
   * milhares de registros para o frontend.
   */
  async listarIds(query: ListarParticipantesQueryDto): Promise<{ ids: string[]; total: number }> {
    const qb = this.montarQuery(query).select('participante.id', 'id');
    const linhas = await qb.getRawMany<{ id: string }>();
    const ids = linhas.map((linha) => linha.id);
    return { ids, total: ids.length };
  }

  async buscarPorId(id: string): Promise<Participante> {
    const participante = await this.repositorio.findOne({ where: { id } });
    if (!participante) {
      throw new NotFoundException(`Participante ${id} não encontrado`);
    }
    return participante;
  }

  /** Detalhe com acréscimos e visão anual (usado na tela do comitê). */
  async buscarDetalhe(id: string): Promise<ParticipanteDetalheDto> {
    const participante = await this.repositorio.findOne({
      where: { id },
      relations: { acrescimos: true },
    });
    if (!participante) {
      throw new NotFoundException(`Participante ${id} não encontrado`);
    }
    return this.montarDetalhe(participante);
  }

  /** Monta a projeção anual a partir de um participante já carregado com acréscimos. */
  montarDetalhe(participante: Participante): ParticipanteDetalheDto {
    const acrescimos = participante.acrescimos ?? [];
    const anual = this.calculoService.aplicarAcrescimos(
      participante.valorPrI,
      participante.valorPrF,
      acrescimos,
    );

    return {
      ...ParticipanteResumoDto.de(participante),
      acrescimos: acrescimos.map((acrescimo) => ({
        id: acrescimo.id,
        areaOrigem: acrescimo.areaOrigem,
        valorAcrescimoPrI: Number(acrescimo.valorAcrescimoPrI),
        valorAcrescimoPrF: Number(acrescimo.valorAcrescimoPrF),
        observacao: acrescimo.observacao,
      })),
      valorPrIAnual: anual.valorPrIAnual,
      valorPrFAnual: anual.valorPrFAnual,
      totalAcrescimoPrI: anual.totalAcrescimoPrI,
      totalAcrescimoPrF: anual.totalAcrescimoPrF,
    };
  }

  /** Garante que todos os IDs informados existem (usado ao salvar um grupo). */
  async validarIds(ids: string[]): Promise<Participante[]> {
    if (!ids.length) return [];
    const unicos = [...new Set(ids)];
    const encontrados: Participante[] = [];

    for (let i = 0; i < unicos.length; i += 500) {
      encontrados.push(
        ...(await this.repositorio.find({ where: { id: In(unicos.slice(i, i + 500)) } })),
      );
    }

    if (encontrados.length !== unicos.length) {
      const existentes = new Set(encontrados.map((p) => p.id));
      const faltantes = unicos.filter((id) => !existentes.has(id));
      throw new NotFoundException(
        `Participante(s) não encontrado(s): ${faltantes.slice(0, 10).join(', ')}` +
          (faltantes.length > 10 ? ` (+${faltantes.length - 10})` : ''),
      );
    }
    return encontrados;
  }

  /** Valores distintos usados para popular os filtros do frontend. */
  async listarOpcoesFiltro(): Promise<Record<string, string[]>> {
    const distintos = async (coluna: keyof Participante): Promise<string[]> => {
      const linhas = await this.repositorio
        .createQueryBuilder('participante')
        .select(`participante.${String(coluna)}`, 'valor')
        .where(`participante.${String(coluna)} IS NOT NULL`)
        .groupBy(`participante.${String(coluna)}`)
        .orderBy('valor', 'ASC')
        .getRawMany<{ valor: string }>();
      return linhas.map((linha) => linha.valor).filter(Boolean);
    };

    const [cargos, niveisCargo, areas, areasOrigem, modelosAvaliacao] = await Promise.all([
      distintos('cargo'),
      distintos('nivelCargo'),
      distintos('area'),
      distintos('areaOrigem'),
      distintos('modeloAvaliacao'),
    ]);

    return { cargos, niveisCargo, areas, areasOrigem, modelosAvaliacao };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private montarQuery(query: ListarParticipantesQueryDto): SelectQueryBuilder<Participante> {
    const qb = this.repositorio.createQueryBuilder('participante');

    if (query.search) {
      const busca = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('participante.nome ILIKE :busca', { busca })
            .orWhere('participante.funcional ILIKE :busca', { busca });
        }),
      );
    }

    if (query.funcional) qb.andWhere('participante.funcional = :funcional', { funcional: query.funcional });
    if (query.cargo) qb.andWhere('participante.cargo = :cargo', { cargo: query.cargo });
    if (query.nivelCargo) qb.andWhere('participante.nivelCargo = :nivelCargo', { nivelCargo: query.nivelCargo });
    if (query.modeloAvaliacao) {
      qb.andWhere('participante.modeloAvaliacao = :modeloAvaliacao', {
        modeloAvaliacao: query.modeloAvaliacao,
      });
    }
    if (query.area) qb.andWhere('participante.area = :area', { area: query.area });
    if (query.areaOrigem) qb.andWhere('participante.areaOrigem = :areaOrigem', { areaOrigem: query.areaOrigem });
    if (query.ativo !== undefined) qb.andWhere('participante.ativo = :ativo', { ativo: query.ativo });

    if (query.grupoId) {
      qb.innerJoin(
        'grupo_participantes',
        'vinculo',
        'vinculo.participante_id = participante.id AND vinculo.grupo_id = :grupoId',
        { grupoId: query.grupoId },
      );
    }

    if (query.foraDoGrupoId) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM grupo_participantes gp
          WHERE gp.participante_id = participante.id AND gp.grupo_id = :foraDoGrupoId
        )`,
        { foraDoGrupoId: query.foraDoGrupoId },
      );
    }

    return qb;
  }
}
