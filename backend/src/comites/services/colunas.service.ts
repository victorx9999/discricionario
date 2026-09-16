import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { ContextoAuditoria } from '../../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../../auth/decorators';
import { AcaoAuditoria, OperacaoAuditoria } from '../../common/enums';
import {
  COLUNAS_POR_CHAVE,
  COLUNAS_TABELA_PARTICIPANTES,
  layoutPadrao,
} from '../../participantes/colunas-participante';
import { SalvarColunasDto } from '../dto';
import { ComiteColuna } from '../entities/comite-coluna.entity';
import { Comite } from '../entities/comite.entity';

export interface ColunaResolvida {
  chave: string;
  rotulo: string;
  grupo: string;
  tipo: string;
  origem: string;
  visivel: boolean;
  ordem: number;
  largura: number | null;
  fixa: boolean;
  ordenavel: boolean;
  descricao?: string;
}

/**
 * Layout da Tabela de Participantes por comitê.
 *
 * O Atendimento monta o comitê e salva aqui como a tabela deve aparecer; a
 * Consultoria abre e recebe exatamente esse layout. Enquanto nada é salvo,
 * vale o layout padrão do catálogo.
 */
@Injectable()
export class ColunasComiteService {
  constructor(
    @InjectRepository(ComiteColuna) private readonly colunas: Repository<ComiteColuna>,
    private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  /** Layout efetivo do comitê: o salvo, ou o padrão quando ainda não há um. */
  async obter(comiteId: string): Promise<{ personalizado: boolean; colunas: ColunaResolvida[] }> {
    const salvas = await this.colunas.find({ where: { comiteId }, order: { ordem: 'ASC' } });

    if (!salvas.length) {
      return {
        personalizado: false,
        colunas: layoutPadrao().map((coluna) => this.resolver(coluna)),
      };
    }

    const porChave = new Map(salvas.map((coluna) => [coluna.chave, coluna]));

    // O catálogo é a fonte: colunas novas aparecem invisíveis por padrão em
    // layouts antigos, sem quebrar o que já estava salvo.
    const completo = COLUNAS_TABELA_PARTICIPANTES.map((definicao, indice) => {
      const salva = porChave.get(definicao.chave);
      return this.resolver({
        chave: definicao.chave,
        visivel: salva ? salva.visivel : false,
        ordem: salva ? salva.ordem : 1000 + indice,
        largura: salva?.largura ?? definicao.largura ?? null,
        fixa: salva ? salva.fixa : Boolean(definicao.fixa),
        rotulo: salva?.rotulo ?? null,
      });
    }).sort((a, b) => a.ordem - b.ordem);

    return { personalizado: true, colunas: completo };
  }

  /** Salva o layout escolhido pelo Atendimento. */
  async salvar(
    comite: Comite,
    dto: SalvarColunasDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ) {
    const invalidas = dto.colunas
      .map((coluna) => coluna.chave)
      .filter((chave) => !COLUNAS_POR_CHAVE.has(chave));

    if (invalidas.length) {
      throw new BadRequestException(
        `Coluna(s) inexistente(s) no catálogo: ${invalidas.join(', ')}. ` +
          'Consulte GET /participantes/colunas.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ComiteColuna, { comiteId: comite.id });
      await manager.insert(
        ComiteColuna,
        dto.colunas.map((coluna, indice) => ({
          comiteId: comite.id,
          chave: coluna.chave,
          visivel: coluna.visivel ?? true,
          ordem: coluna.ordem ?? indice,
          largura: coluna.largura ?? COLUNAS_POR_CHAVE.get(coluna.chave)?.largura ?? null,
          fixa: coluna.fixa ?? false,
          rotulo: coluna.rotulo ?? null,
        })),
      );
    });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COLUNAS_ALTERADAS,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: comite.id,
      cicloId: comite.cicloId,
      comiteId: comite.id,
      usuario,
      campoAlterado: 'colunas',
      valorNovo: dto.colunas.filter((coluna) => coluna.visivel !== false).map((c) => c.chave),
      contexto,
    });

    return this.obter(comite.id);
  }

  /** Volta o comitê ao layout padrão do catálogo. */
  async restaurarPadrao(comite: Comite, usuario: UsuarioAutenticado, contexto?: ContextoAuditoria) {
    await this.colunas.delete({ comiteId: comite.id });

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COLUNAS_ALTERADAS,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: comite.id,
      cicloId: comite.cicloId,
      comiteId: comite.id,
      usuario,
      campoAlterado: 'colunas',
      valorNovo: 'layout padrão restaurado',
      contexto,
    });

    return this.obter(comite.id);
  }

  private resolver(coluna: {
    chave: string;
    visivel: boolean;
    ordem: number;
    largura: number | null;
    fixa: boolean;
    rotulo: string | null;
  }): ColunaResolvida {
    const definicao = COLUNAS_POR_CHAVE.get(coluna.chave);

    return {
      chave: coluna.chave,
      rotulo: coluna.rotulo ?? definicao?.rotulo ?? coluna.chave,
      grupo: definicao?.grupo ?? 'Controle',
      tipo: definicao?.tipo ?? 'texto',
      origem: definicao?.origem ?? 'base',
      visivel: coluna.visivel,
      ordem: coluna.ordem,
      largura: coluna.largura,
      fixa: coluna.fixa,
      ordenavel: Boolean(definicao?.ordenavel),
      descricao: definicao?.descricao,
    };
  }
}
