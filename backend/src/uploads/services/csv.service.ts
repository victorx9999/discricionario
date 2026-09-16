import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { ExcecaoUpload } from '../../common/filters';
import { interpretarNumero } from '../../common/utils';
import { DefinicaoColuna, normalizarCabecalho } from './mapeamento-colunas';

/** Erro em um registro específico do arquivo. */
export interface ErroLinha {
  linha: number;
  coluna?: string;
  valor?: string;
  mensagem: string;
}

/** Resultado da leitura + validação de um CSV. */
export interface ResultadoLeituraCsv<T = Record<string, unknown>> {
  /** Registros válidos, já convertidos para os tipos corretos. */
  registros: Array<{ linha: number; dados: T }>;
  /** Registros descartados por erro de validação. */
  erros: ErroLinha[];
  /** Total de linhas de dados encontradas (sem contar o cabeçalho). */
  totalLinhas: number;
  /** Cabeçalhos presentes no arquivo que não estão mapeados. */
  colunasIgnoradas: string[];
}

const DELIMITADORES = [';', ',', '\t', '|'];

/**
 * Leitura e validação de arquivos CSV.
 *
 * Responsabilidades:
 *  - detectar o delimitador;
 *  - conferir a presença das colunas obrigatórias;
 *  - validar o tipo de cada célula;
 *  - separar registros válidos de registros com erro (o arquivo não é
 *    rejeitado inteiro por causa de algumas linhas ruins).
 */
@Injectable()
export class CsvService {
  /** Detecta o delimitador contando ocorrências na primeira linha. */
  detectarDelimitador(conteudo: string): string {
    const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] ?? '';
    let melhor = ';';
    let maiorContagem = -1;

    for (const delimitador of DELIMITADORES) {
      const contagem = primeiraLinha.split(delimitador).length - 1;
      if (contagem > maiorContagem) {
        maiorContagem = contagem;
        melhor = delimitador;
      }
    }
    return maiorContagem > 0 ? melhor : ';';
  }

  /**
   * Lê o arquivo aplicando o mapeamento de colunas informado.
   * Lança `ExcecaoUpload` apenas para problemas estruturais (arquivo vazio,
   * ilegível ou sem colunas obrigatórias) — erros de linha são acumulados.
   */
  ler<T = Record<string, unknown>>(
    buffer: Buffer,
    definicoes: DefinicaoColuna[],
  ): ResultadoLeituraCsv<T> {
    const conteudo = buffer.toString('utf8').replace(/^\uFEFF/, '');

    if (!conteudo.trim()) {
      throw new ExcecaoUpload('O arquivo enviado está vazio');
    }

    let linhas: string[][];
    try {
      linhas = parse(conteudo, {
        delimiter: this.detectarDelimitador(conteudo),
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true,
        bom: true,
      }) as string[][];
    } catch (erro) {
      throw new ExcecaoUpload('Não foi possível interpretar o arquivo CSV', {
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }

    if (linhas.length < 2) {
      throw new ExcecaoUpload('O arquivo precisa conter um cabeçalho e ao menos uma linha de dados');
    }

    const cabecalho = linhas[0].map(normalizarCabecalho);
    const indices = this.mapearIndices(cabecalho, definicoes);
    const colunasIgnoradas = this.identificarColunasIgnoradas(linhas[0], cabecalho, definicoes);

    const registros: Array<{ linha: number; dados: T }> = [];
    const erros: ErroLinha[] = [];

    for (let i = 1; i < linhas.length; i += 1) {
      const numeroLinha = i + 1; // 1 = cabeçalho
      const celulas = linhas[i];

      if (celulas.every((celula) => !String(celula ?? '').trim())) {
        continue; // linha totalmente em branco
      }

      const { dados, errosLinha } = this.converterLinha(celulas, definicoes, indices, numeroLinha);

      if (errosLinha.length) {
        erros.push(...errosLinha);
      } else {
        registros.push({ linha: numeroLinha, dados: dados as T });
      }
    }

    return {
      registros,
      erros,
      totalLinhas: linhas.length - 1,
      colunasIgnoradas,
    };
  }

  // ------------------------------------------------------------------
  // Auxiliares
  // ------------------------------------------------------------------

  /** Casa cada definição com o índice da coluna no arquivo. */
  private mapearIndices(
    cabecalhoNormalizado: string[],
    definicoes: DefinicaoColuna[],
  ): Map<string, number> {
    const indices = new Map<string, number>();
    const faltantes: string[] = [];

    for (const definicao of definicoes) {
      const indice = cabecalhoNormalizado.findIndex((coluna) =>
        definicao.cabecalhos.includes(coluna),
      );

      if (indice >= 0) {
        indices.set(definicao.campo, indice);
      } else if (definicao.obrigatoria) {
        faltantes.push(definicao.rotulo);
      }
    }

    if (faltantes.length) {
      throw new ExcecaoUpload(
        `Colunas obrigatórias ausentes no arquivo: ${faltantes.join(', ')}`,
        {
          colunasObrigatoriasAusentes: faltantes,
          colunasEncontradas: cabecalhoNormalizado,
        },
      );
    }

    return indices;
  }

  private identificarColunasIgnoradas(
    cabecalhoOriginal: string[],
    cabecalhoNormalizado: string[],
    definicoes: DefinicaoColuna[],
  ): string[] {
    const conhecidos = new Set(definicoes.flatMap((definicao) => definicao.cabecalhos));
    return cabecalhoOriginal.filter((_, indice) => !conhecidos.has(cabecalhoNormalizado[indice]));
  }

  private converterLinha(
    celulas: string[],
    definicoes: DefinicaoColuna[],
    indices: Map<string, number>,
    numeroLinha: number,
  ): { dados: Record<string, unknown>; errosLinha: ErroLinha[] } {
    const dados: Record<string, unknown> = {};
    const errosLinha: ErroLinha[] = [];

    for (const definicao of definicoes) {
      const indice = indices.get(definicao.campo);

      // Coluna ausente do arquivo: o campo nem entra no objeto, para que a
      // carga parcial não sobrescreva com null o que já existe no banco.
      if (indice === undefined) continue;

      const bruto = String(celulas[indice] ?? '').trim();

      if (!bruto) {
        if (definicao.obrigatoria) {
          errosLinha.push({
            linha: numeroLinha,
            coluna: definicao.rotulo,
            valor: bruto,
            mensagem: `Coluna obrigatória "${definicao.rotulo}" está vazia`,
          });
        } else {
          dados[definicao.campo] = null;
        }
        continue;
      }

      if (definicao.tipo === 'texto') {
        if (definicao.tamanhoMaximo && bruto.length > definicao.tamanhoMaximo) {
          errosLinha.push({
            linha: numeroLinha,
            coluna: definicao.rotulo,
            valor: bruto.slice(0, 60),
            mensagem: `"${definicao.rotulo}" excede o tamanho máximo de ${definicao.tamanhoMaximo} caracteres`,
          });
          continue;
        }
        dados[definicao.campo] = bruto;
        continue;
      }

      if (definicao.tipo === 'booleano') {
        dados[definicao.campo] = ['1', 'true', 'verdadeiro', 'sim', 's', 'y', 'x'].includes(
          bruto.toLowerCase(),
        );
        continue;
      }

      if (definicao.tipo === 'data') {
        const data = interpretarData(bruto);
        if (!data) {
          errosLinha.push({
            linha: numeroLinha,
            coluna: definicao.rotulo,
            valor: bruto.slice(0, 60),
            mensagem: `"${definicao.rotulo}" deve ser uma data (dd/mm/aaaa ou aaaa-mm-dd). Valor recebido: "${bruto}"`,
          });
          continue;
        }
        dados[definicao.campo] = data;
        continue;
      }

      const numero = interpretarNumero(bruto);
      if (numero === null) {
        errosLinha.push({
          linha: numeroLinha,
          coluna: definicao.rotulo,
          valor: bruto.slice(0, 60),
          mensagem: `"${definicao.rotulo}" deve ser numérico. Valor recebido: "${bruto}"`,
        });
        continue;
      }

      if (definicao.tipo === 'inteiro' && !Number.isInteger(numero)) {
        errosLinha.push({
          linha: numeroLinha,
          coluna: definicao.rotulo,
          valor: bruto,
          mensagem: `"${definicao.rotulo}" deve ser um número inteiro`,
        });
        continue;
      }

      dados[definicao.campo] = numero;
    }

    return { dados, errosLinha };
  }
}

/**
 * Interpreta datas em `dd/mm/aaaa`, `aaaa-mm-dd` ou `dd-mm-aaaa`.
 * Devolve `null` quando o conteúdo não é uma data válida.
 */
export function interpretarData(texto: string): Date | null {
  const limpo = texto.trim();
  if (!limpo) return null;

  const isoCompleto = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
  if (isoCompleto) {
    const data = new Date(Number(isoCompleto[1]), Number(isoCompleto[2]) - 1, Number(isoCompleto[3]));
    return Number.isNaN(data.getTime()) ? null : data;
  }

  const brasileiro = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(limpo);
  if (brasileiro) {
    const ano = Number(brasileiro[3]);
    const anoCompleto = ano < 100 ? 2000 + ano : ano;
    const data = new Date(anoCompleto, Number(brasileiro[2]) - 1, Number(brasileiro[1]));
    return Number.isNaN(data.getTime()) ? null : data;
  }

  return null;
}
