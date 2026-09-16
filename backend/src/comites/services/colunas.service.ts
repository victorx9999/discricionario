import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { ContextoAuditoria } from '../../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../../auth/decorators';
import { AcaoAuditoria, ContextoColuna, OperacaoAuditoria } from '../../common/enums';
import {
  COLUNAS_POR_CHAVE,
  COLUNAS_TABELA_PARTICIPANTES,
  layoutPadrao,
  layoutPadraoPainel,
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

  /**
   * Layout efetivo do comitê num contexto: o salvo, ou o padrão quando ainda
   * não há um. TABELA são as colunas da tabela de participantes; PAINEL são os
   * campos de valor do painel de análise.
   */
  async obter(
    comiteId: string,
    contexto: ContextoColuna = ContextoColuna.TABELA,
  ): Promise<{ contexto: ContextoColuna; personalizado: boolean; colunas: ColunaResolvida[] }> {
    const salvas = await this.colunas.find({
      where: { comiteId, contexto },
      order: { ordem: 'ASC' },
    });

    const padrao = contexto === ContextoColuna.PAINEL ? layoutPadraoPainel() : layoutPadrao();

    if (!salvas.length) {
      return {
        contexto,
        personalizado: false,
        colunas: padrao.map((coluna) => this.resolver(coluna)),
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

    return { contexto, personalizado: true, colunas: completo };
  }

  /** Os dois layouts de uma vez — é o que a tela do comitê carrega ao abrir. */
  async obterLayout(comiteId: string) {
    const [tabela, painel] = await Promise.all([
      this.obter(comiteId, ContextoColuna.TABELA),
      this.obter(comiteId, ContextoColuna.PAINEL),
    ]);
    return { tabela, painel };
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

    const contextoColuna = dto.contexto ?? ContextoColuna.TABELA;

    // Substitui apenas o contexto informado: salvar o painel não apaga a tabela.
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ComiteColuna, { comiteId: comite.id, contexto: contextoColuna });
      await manager.insert(
        ComiteColuna,
        dto.colunas.map((coluna, indice) => ({
          comiteId: comite.id,
          contexto: contextoColuna,
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
      campoAlterado: contextoColuna === ContextoColuna.PAINEL ? 'campos do painel' : 'colunas',
      valorNovo: dto.colunas.filter((coluna) => coluna.visivel !== false).map((c) => c.chave),
      contexto,
    });

    return this.obter(comite.id, contextoColuna);
  }

  /**
   * Volta o comitê ao layout padrão do catálogo. Sem contexto informado,
   * restaura os dois (tabela e painel).
   */
  async restaurarPadrao(
    comite: Comite,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
    contextoColuna?: ContextoColuna,
  ) {
    await this.colunas.delete(
      contextoColuna
        ? { comiteId: comite.id, contexto: contextoColuna }
        : { comiteId: comite.id },
    );

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.COLUNAS_ALTERADAS,
      operacao: OperacaoAuditoria.UPDATE,
      entidade: 'COMITE',
      entidadeId: comite.id,
      cicloId: comite.cicloId,
      comiteId: comite.id,
      usuario,
      campoAlterado: contextoColuna === ContextoColuna.PAINEL ? 'campos do painel' : 'colunas',
      valorNovo: `layout padrão restaurado (${contextoColuna ?? 'TABELA e PAINEL'})`,
      contexto,
    });

    return contextoColuna ? this.obter(comite.id, contextoColuna) : this.obterLayout(comite.id);
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
