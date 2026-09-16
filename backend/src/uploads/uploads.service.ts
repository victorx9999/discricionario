import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { UsuarioAutenticado } from '../auth/decorators';
import { CiclosService } from '../ciclos/ciclos.service';
import { Ciclo } from '../ciclos/entities/ciclo.entity';
import { ResultadoPaginado } from '../common/dto';
import {
  AcaoAuditoria,
  ModoCarga,
  OperacaoAuditoria,
  StatusImportacao,
  TipoBase,
} from '../common/enums';
import { ExcecaoNegocio, ExcecaoUpload } from '../common/filters';
import { Comite } from '../comites/entities/comite.entity';
import { Acrescimo } from '../participantes/entities/acrescimo.entity';
import { Participante } from '../participantes/entities/participante.entity';
import {
  ListarUploadsQueryDto,
  PreviaUploadDto,
  ProcessarUploadDto,
  ResultadoUploadDto,
} from './dto';
import { ErroImportacao } from './entities/erro-importacao.entity';
import { Importacao } from './entities/importacao.entity';
import { CsvService, ErroLinha } from './services/csv.service';
import { COLUNAS_BASE_ACRESCIMO, COLUNAS_BASE_PRINCIPAL } from './services/mapeamento-colunas';
import {
  LinhaBaseAcrescimo,
  ProcessadorAcrescimoService,
} from './services/processador-acrescimo.service';
import {
  LinhaBasePrincipal,
  ProcessadorPrincipalService,
} from './services/processador-principal.service';

const EXTENSOES_ACEITAS = ['.csv', '.txt'];
const MAX_ERROS_RETORNADOS = 100;

/**
 * Orquestra a carga das bases: validar arquivo -> ler CSV -> processar ->
 * registrar erros -> auditar. Tudo dentro de uma transação e sempre com um
 * ciclo alvo explícito, que é o que mantém os anos isolados.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(Importacao) private readonly importacoes: Repository<Importacao>,
    @InjectRepository(ErroImportacao) private readonly errosImportacao: Repository<ErroImportacao>,
    @InjectRepository(Participante) private readonly participantes: Repository<Participante>,
    @InjectRepository(Acrescimo) private readonly acrescimos: Repository<Acrescimo>,
    @InjectRepository(Comite) private readonly comites: Repository<Comite>,
    private readonly dataSource: DataSource,
    private readonly csvService: CsvService,
    private readonly processadorPrincipal: ProcessadorPrincipalService,
    private readonly processadorAcrescimo: ProcessadorAcrescimoService,
    private readonly ciclosService: CiclosService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------
  // Pré-visualização
  // ------------------------------------------------------------------

  /**
   * Lê o arquivo sem gravar nada e devolve o que a carga faria: colunas
   * reconhecidas e ignoradas, quantos registros são novos, quantos serão
   * atualizados e — na carga completa — o que será apagado do ciclo.
   */
  async previsualizar(
    arquivo: Express.Multer.File,
    dto: ProcessarUploadDto,
  ): Promise<PreviaUploadDto> {
    this.validarArquivo(arquivo);
    const ciclo = await this.ciclosService.resolver(dto.ciclo);
    const modo = this.resolverModo(dto);

    const definicoes = this.definicoes(dto.tipoBase);
    const leitura = this.csvService.ler(arquivo.buffer, definicoes);

    const chaves = leitura.registros.map(({ dados }) => String((dados as { emplid: string }).emplid));
    const existentes = await this.contarExistentes(dto.tipoBase, ciclo.id, chaves);

    return {
      ciclo: ciclo.ano,
      tipoBase: dto.tipoBase,
      modo,
      nomeArquivo: arquivo.originalname,
      colunasReconhecidas: definicoes
        .filter((definicao) => !leitura.colunasIgnoradas.includes(definicao.rotulo))
        .map((definicao) => definicao.rotulo),
      colunasIgnoradas: leitura.colunasIgnoradas,
      colunasObrigatoriasAusentes: [],
      totalRegistros: leitura.totalLinhas,
      registrosValidos: leitura.registros.length,
      registrosComErro: leitura.erros.length,
      novos: leitura.registros.length - existentes,
      atualizados: modo === ModoCarga.COMPLETA ? 0 : existentes,
      erros: leitura.erros.slice(0, MAX_ERROS_RETORNADOS),
      impactoDoReinicio:
        modo === ModoCarga.COMPLETA && dto.tipoBase === TipoBase.PRINCIPAL
          ? await this.contarImpactoDoReinicio(ciclo.id)
          : null,
    };
  }

  // ------------------------------------------------------------------
  // Processamento
  // ------------------------------------------------------------------

  async processar(
    arquivo: Express.Multer.File,
    dto: ProcessarUploadDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<ResultadoUploadDto> {
    this.validarArquivo(arquivo);

    const ciclo = await this.ciclosService.resolver(dto.ciclo);
    this.ciclosService.garantirAberto(ciclo);

    const modo = this.resolverModo(dto);
    await this.garantirConfirmacaoDoReinicio(dto, modo, ciclo);

    const importacao = await this.importacoes.save(
      this.importacoes.create({
        cicloId: ciclo.id,
        tipoBase: dto.tipoBase,
        modo,
        nomeArquivo: arquivo.originalname,
        tamanhoBytes: String(arquivo.size),
        status: StatusImportacao.PROCESSANDO,
        executadoPorId: usuario.id,
      }),
    );

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.UPLOAD_INICIADO,
      operacao: OperacaoAuditoria.INSERT,
      entidade: 'IMPORTACAO',
      entidadeId: importacao.id,
      cicloId: ciclo.id,
      usuario,
      detalhes: { ciclo: ciclo.ano, tipoBase: dto.tipoBase, modo, arquivo: arquivo.originalname },
      contexto,
    });

    try {
      const leitura = this.csvService.ler(arquivo.buffer, this.definicoes(dto.tipoBase));

      const resultado = await this.dataSource.transaction(async (manager) =>
        dto.tipoBase === TipoBase.PRINCIPAL
          ? this.processadorPrincipal.processar(
              manager,
              ciclo,
              leitura.registros as Array<{ linha: number; dados: LinhaBasePrincipal }>,
              modo,
              importacao.id,
              dto.vincularPorGrupoRanking !== false,
            )
          : this.processadorAcrescimo.processar(
              manager,
              ciclo,
              leitura.registros as Array<{ linha: number; dados: LinhaBaseAcrescimo }>,
              importacao.id,
            ),
      );

      const todosErros = [...leitura.erros, ...resultado.erros].sort((a, b) => a.linha - b.linha);
      await this.gravarErros(importacao.id, todosErros);

      const processados = resultado.inseridos + resultado.atualizados;
      const status = todosErros.length
        ? StatusImportacao.CONCLUIDO_COM_ERROS
        : StatusImportacao.CONCLUIDO;

      await this.importacoes.update(
        { id: importacao.id },
        {
          status,
          totalRegistros: leitura.totalLinhas,
          registrosProcessados: processados,
          registrosInseridos: resultado.inseridos,
          registrosAtualizados: resultado.atualizados,
          registrosRemovidos: resultado.removidos,
          registrosComErro: todosErros.length,
          resumo: { ...resultado.resumo, colunasIgnoradas: leitura.colunasIgnoradas },
          finalizadoEm: new Date(),
        },
      );

      await this.auditoriaService.registrar({
        acao: AcaoAuditoria.UPLOAD_CONCLUIDO,
        operacao: OperacaoAuditoria.UPDATE,
        entidade: 'IMPORTACAO',
        entidadeId: importacao.id,
        cicloId: ciclo.id,
        usuario,
        detalhes: {
          ciclo: ciclo.ano,
          tipoBase: dto.tipoBase,
          modo,
          totalRegistros: leitura.totalLinhas,
          registrosProcessados: processados,
          registrosComErro: todosErros.length,
          ...resultado.resumo,
        },
        contexto,
      });

      return {
        importacaoId: importacao.id,
        ciclo: ciclo.ano,
        tipoBase: dto.tipoBase,
        modo,
        status,
        nomeArquivo: arquivo.originalname,
        totalRegistros: leitura.totalLinhas,
        registrosProcessados: processados,
        registrosInseridos: resultado.inseridos,
        registrosAtualizados: resultado.atualizados,
        registrosRemovidos: resultado.removidos,
        registrosComErro: todosErros.length,
        erros: todosErros.slice(0, MAX_ERROS_RETORNADOS),
        resumo: resultado.resumo,
        colunasIgnoradas: leitura.colunasIgnoradas,
      };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`Falha na importação ${importacao.id}: ${mensagem}`);

      await this.importacoes.update(
        { id: importacao.id },
        { status: StatusImportacao.FALHOU, mensagemErro: mensagem, finalizadoEm: new Date() },
      );

      await this.auditoriaService.registrar({
        acao: AcaoAuditoria.UPLOAD_FALHOU,
        operacao: OperacaoAuditoria.ERRO,
        entidade: 'IMPORTACAO',
        entidadeId: importacao.id,
        cicloId: ciclo.id,
        usuario,
        detalhes: { erro: mensagem, ciclo: ciclo.ano, tipoBase: dto.tipoBase, modo },
        contexto,
      });

      throw erro;
    }
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async listar(query: ListarUploadsQueryDto): Promise<ResultadoPaginado<Importacao>> {
    const ciclo = await this.ciclosService.resolver(query.ciclo);

    const where: Record<string, unknown> = { cicloId: ciclo.id };
    if (query.tipoBase) where.tipoBase = query.tipoBase;
    if (query.modo) where.modo = query.modo;
    if (query.status) where.status = query.status;

    const resultado = await this.importacoes.findAndCount({
      where,
      order: { criadoEm: 'DESC' },
      skip: query.skip,
      take: query.take,
      relations: { executadoPor: true, ciclo: true },
    });

    return ResultadoPaginado.de(resultado, query);
  }

  async buscarPorId(id: string): Promise<Importacao> {
    const importacao = await this.importacoes.findOne({
      where: { id },
      relations: { executadoPor: true, ciclo: true },
    });
    if (!importacao) {
      throw new NotFoundException(`Importação ${id} não encontrada`);
    }
    return importacao;
  }

  async listarErros(id: string): Promise<ErroImportacao[]> {
    await this.buscarPorId(id);
    return this.errosImportacao.find({
      where: { importacaoId: id },
      order: { linha: 'ASC' },
      take: 1000,
    });
  }

  /** Layout esperado de cada base — orienta a tela de upload. */
  obterLayouts() {
    const mapear = (colunas: typeof COLUNAS_BASE_PRINCIPAL) =>
      colunas.map((coluna) => ({
        coluna: coluna.rotulo,
        obrigatoria: coluna.obrigatoria,
        tipo: coluna.tipo,
        cabecalhosAceitos: coluna.cabecalhos,
        campoDeDecisao: Boolean(coluna.decisao),
      }));

    return {
      [TipoBase.PRINCIPAL]: {
        tabela: 'TBPR_Simuladores',
        colunas: mapear(COLUNAS_BASE_PRINCIPAL),
      },
      [TipoBase.ACRESCIMO]: {
        tabela: 'TBPR_Simuladores_Acres',
        colunas: mapear(COLUNAS_BASE_ACRESCIMO),
      },
      formatoAceito: 'CSV UTF-8 (delimitador ; , tab ou | detectado automaticamente)',
      modos: {
        [ModoCarga.COMPLETA]:
          'Reinicia o ciclo alvo: apaga comitês, ATAs e discricionários DAQUELE ano e recarrega a base. ' +
          'Ciclos anteriores não são afetados. Exige confirmarReinicioDoCiclo=true.',
        [ModoCarga.PARCIAL]:
          'Atualiza e insere preservando FD, NOTA_DISCRICIONARIO, MOTIVO_DISCRICIONARIO, ' +
          'OBSERVACAO_POSCOMITE e COD_MOTIVADOR. FPI_FINAL e VL_PR_F são recalculados.',
      },
      observacaoAcrescimo:
        'A base de acréscimo é sempre recarregada por inteiro dentro do ciclo (truncate por ciclo).',
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private definicoes(tipoBase: TipoBase) {
    return tipoBase === TipoBase.PRINCIPAL ? COLUNAS_BASE_PRINCIPAL : COLUNAS_BASE_ACRESCIMO;
  }

  /** A base de acréscimo é sempre carga completa (do ciclo). */
  private resolverModo(dto: ProcessarUploadDto): ModoCarga {
    return dto.tipoBase === TipoBase.ACRESCIMO ? ModoCarga.COMPLETA : (dto.modo ?? ModoCarga.PARCIAL);
  }

  /**
   * A carga completa da base principal apaga comitês, ATAs e discricionários
   * do ciclo. Quando já existe trabalho lançado, exige confirmação explícita.
   */
  private async garantirConfirmacaoDoReinicio(
    dto: ProcessarUploadDto,
    modo: ModoCarga,
    ciclo: Ciclo,
  ): Promise<void> {
    if (dto.tipoBase !== TipoBase.PRINCIPAL || modo !== ModoCarga.COMPLETA) return;
    if (dto.confirmarReinicioDoCiclo) return;

    const impacto = await this.contarImpactoDoReinicio(ciclo.id);
    const temTrabalho = impacto.comites > 0 || impacto.discricionariosLancados > 0;
    if (!temTrabalho) return;

    throw new ExcecaoNegocio(
      `A carga completa reinicia o ciclo ${ciclo.ano} e vai apagar ${impacto.comites} comitê(s), ` +
        `${impacto.atas} ATA(s) e ${impacto.discricionariosLancados} discricionário(s) lançado(s). ` +
        'Reenvie com "confirmarReinicioDoCiclo": true para prosseguir.',
      'REINICIO_DE_CICLO_NAO_CONFIRMADO',
      { ciclo: ciclo.ano, impacto, exigeConfirmacao: true },
    );
  }

  private async contarImpactoDoReinicio(cicloId: string): Promise<Record<string, number>> {
    const [participantes, comites, acrescimos, discricionariosLancados, atas] = await Promise.all([
      this.participantes.count({ where: { cicloId } }),
      this.comites.count({ where: { cicloId } }),
      this.acrescimos.count({ where: { cicloId } }),
      this.participantes.count({ where: { cicloId, fd: Not(0) } }),
      this.comites
        .createQueryBuilder('comite')
        .innerJoin('comite.ata', 'ata')
        .where('comite.ciclo_id = :cicloId', { cicloId })
        .getCount(),
    ]);

    return { participantes, comites, acrescimos, discricionariosLancados, atas };
  }

  private async contarExistentes(
    tipoBase: TipoBase,
    cicloId: string,
    chaves: string[],
  ): Promise<number> {
    if (!chaves.length) return 0;
    const unicos = [...new Set(chaves)];

    let total = 0;
    for (let i = 0; i < unicos.length; i += 500) {
      const lote = unicos.slice(i, i + 500);
      total +=
        tipoBase === TipoBase.PRINCIPAL
          ? await this.participantes.count({ where: { cicloId, emplid: In(lote) } })
          : await this.acrescimos.count({ where: { cicloId, emplid: In(lote) } });
    }
    return total;
  }

  private validarArquivo(arquivo: Express.Multer.File): void {
    if (!arquivo) {
      throw new ExcecaoUpload('Nenhum arquivo foi enviado. Use o campo "file" (multipart/form-data)');
    }
    if (!arquivo.size) {
      throw new ExcecaoUpload('O arquivo enviado está vazio');
    }

    const extensao = arquivo.originalname.slice(arquivo.originalname.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES_ACEITAS.includes(extensao)) {
      throw new ExcecaoUpload(`Formato não suportado: "${extensao}". Envie um arquivo CSV.`, {
        extensoesAceitas: EXTENSOES_ACEITAS,
      });
    }
  }

  private async gravarErros(importacaoId: string, erros: ErroLinha[]): Promise<void> {
    if (!erros.length) return;

    const registros = erros.map((erro) => ({
      importacaoId,
      linha: erro.linha,
      coluna: erro.coluna ?? null,
      valor: erro.valor?.slice(0, 255) ?? null,
      mensagem: erro.mensagem.slice(0, 500),
    }));

    for (let i = 0; i < registros.length; i += 500) {
      await this.errosImportacao.insert(registros.slice(i, i + 500));
    }
  }
}
