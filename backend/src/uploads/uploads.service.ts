import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ResultadoPaginado } from '../common/dto';
import { AcaoAuditoria, ModoProcessamento, StatusImportacao, TipoBase } from '../common/enums';
import { ExcecaoUpload } from '../common/filters';
import { UsuarioAutenticado } from '../auth/decorators';
import { ListarUploadsQueryDto, ProcessarUploadDto, ResultadoUploadDto } from './dto';
import { ErroImportacao } from './entities/erro-importacao.entity';
import { Importacao } from './entities/importacao.entity';
import { CsvService, ErroLinha } from './services/csv.service';
import { COLUNAS_BASE_ACRESCIMO, COLUNAS_BASE_PRINCIPAL } from './services/mapeamento-colunas';
import {
  LinhaBaseAcrescimo,
  ProcessadorBaseAcrescimoService,
} from './services/processador-base-acrescimo.service';
import {
  LinhaBasePrincipal,
  ProcessadorBasePrincipalService,
} from './services/processador-base-principal.service';

/** Extensões aceitas — nesta versão o sistema processa apenas CSV. */
const EXTENSOES_ACEITAS = ['.csv', '.txt'];
const MAX_ERROS_RETORNADOS = 100;

/**
 * Orquestra o fluxo completo de upload:
 * validar arquivo -> ler CSV -> processar -> registrar erros -> auditar.
 *
 * Todo o processamento acontece dentro de uma transação: se algo falhar no
 * meio, a base não fica em estado inconsistente.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @InjectRepository(Importacao)
    private readonly importacoes: Repository<Importacao>,
    @InjectRepository(ErroImportacao)
    private readonly errosImportacao: Repository<ErroImportacao>,
    private readonly dataSource: DataSource,
    private readonly csvService: CsvService,
    private readonly processadorPrincipal: ProcessadorBasePrincipalService,
    private readonly processadorAcrescimo: ProcessadorBaseAcrescimoService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async processar(
    arquivo: Express.Multer.File,
    dto: ProcessarUploadDto,
    usuario: UsuarioAutenticado,
    contexto?: ContextoAuditoria,
  ): Promise<ResultadoUploadDto> {
    this.validarArquivo(arquivo);

    const importacao = await this.importacoes.save(
      this.importacoes.create({
        tipoBase: dto.tipoBase,
        modo: dto.modo,
        nomeArquivo: arquivo.originalname,
        tamanhoBytes: String(arquivo.size),
        status: StatusImportacao.PROCESSANDO,
        executadoPorId: usuario.id,
      }),
    );

    await this.auditoriaService.registrar({
      acao: AcaoAuditoria.UPLOAD_INICIADO,
      entidade: 'IMPORTACAO',
      entidadeId: importacao.id,
      usuario: { id: usuario.id, email: usuario.email },
      detalhes: { tipoBase: dto.tipoBase, modo: dto.modo, arquivo: arquivo.originalname },
      contexto,
    });

    try {
      const definicoes =
        dto.tipoBase === TipoBase.PRINCIPAL ? COLUNAS_BASE_PRINCIPAL : COLUNAS_BASE_ACRESCIMO;
      const leitura = this.csvService.ler(arquivo.buffer, definicoes);

      const resultado = await this.dataSource.transaction(async (manager) => {
        return dto.tipoBase === TipoBase.PRINCIPAL
          ? this.processadorPrincipal.processar(
              manager,
              leitura.registros as unknown as Array<{ linha: number; dados: LinhaBasePrincipal }>,
              dto.modo,
              importacao.id,
            )
          : this.processadorAcrescimo.processar(
              manager,
              leitura.registros as unknown as Array<{ linha: number; dados: LinhaBaseAcrescimo }>,
              dto.modo,
              importacao.id,
            );
      });

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
        entidade: 'IMPORTACAO',
        entidadeId: importacao.id,
        usuario: { id: usuario.id, email: usuario.email },
        detalhes: {
          tipoBase: dto.tipoBase,
          modo: dto.modo,
          totalRegistros: leitura.totalLinhas,
          registrosProcessados: processados,
          registrosComErro: todosErros.length,
          ...resultado.resumo,
        },
        contexto,
      });

      return {
        importacaoId: importacao.id,
        tipoBase: dto.tipoBase,
        modo: dto.modo,
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
        entidade: 'IMPORTACAO',
        entidadeId: importacao.id,
        usuario: { id: usuario.id, email: usuario.email },
        detalhes: { erro: mensagem, tipoBase: dto.tipoBase, modo: dto.modo },
        contexto,
      });

      throw erro;
    }
  }

  async listar(query: ListarUploadsQueryDto): Promise<ResultadoPaginado<Importacao>> {
    const where: Record<string, unknown> = {};
    if (query.tipoBase) where.tipoBase = query.tipoBase;
    if (query.modo) where.modo = query.modo;
    if (query.status) where.status = query.status;

    const resultado = await this.importacoes.findAndCount({
      where,
      order: { criadoEm: 'DESC' },
      skip: query.skip,
      take: query.take,
      relations: { executadoPor: true },
    });

    return ResultadoPaginado.de(resultado, query);
  }

  async buscarPorId(id: string): Promise<Importacao> {
    const importacao = await this.importacoes.findOne({
      where: { id },
      relations: { executadoPor: true },
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

  /** Modelos de cabeçalho aceitos — útil para a tela de upload orientar o usuário. */
  obterLayouts() {
    const mapear = (colunas: typeof COLUNAS_BASE_PRINCIPAL) =>
      colunas.map((coluna) => ({
        coluna: coluna.rotulo,
        obrigatoria: coluna.obrigatoria,
        tipo: coluna.tipo,
        cabecalhosAceitos: coluna.cabecalhos,
      }));

    return {
      [TipoBase.PRINCIPAL]: mapear(COLUNAS_BASE_PRINCIPAL),
      [TipoBase.ACRESCIMO]: mapear(COLUNAS_BASE_ACRESCIMO),
      formatoAceito: 'CSV (delimitador ; , tab ou | detectado automaticamente, codificação UTF-8)',
      modos: {
        [ModoProcessamento.COMPLETO]:
          'Substitui os dados. Na base principal, também remove grupos, comitês, análises e discricionários.',
        [ModoProcessamento.INCREMENTAL]:
          'Atualiza os participantes existentes e insere os novos, preservando grupos e comitês.',
      },
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  private validarArquivo(arquivo: Express.Multer.File): void {
    if (!arquivo) {
      throw new ExcecaoUpload('Nenhum arquivo foi enviado. Utilize o campo "file" (multipart/form-data)');
    }
    if (!arquivo.size) {
      throw new ExcecaoUpload('O arquivo enviado está vazio');
    }

    const extensao = arquivo.originalname.slice(arquivo.originalname.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES_ACEITAS.includes(extensao)) {
      throw new ExcecaoUpload(
        `Formato de arquivo não suportado: "${extensao}". Envie um arquivo CSV.`,
        { extensoesAceitas: EXTENSOES_ACEITAS },
      );
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
