import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Corpo de erro padronizado devolvido por toda a API. */
export interface RespostaErro {
  statusCode: number;
  message: string | string[];
  error: string;
  codigo?: string;
  detalhes?: unknown;
  timestamp: string;
  path: string;
}

const NOMES_HTTP: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

/**
 * Filtro global de exceções.
 *
 * Garante que qualquer erro — HttpException, erro do TypeORM ou exceção
 * inesperada — seja devolvido no mesmo formato:
 *
 * ```json
 * { "statusCode": 400, "message": "...", "error": "Bad Request" }
 * ```
 */
@Catch()
export class HttpExcecaoFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExcecaoFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const corpo = this.montarCorpo(exception, request);

    if (corpo.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${corpo.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${corpo.statusCode}: ${corpo.message}`);
    }

    response.status(corpo.statusCode).json(corpo);
  }

  private montarCorpo(exception: unknown, request: Request): RespostaErro {
    const base = {
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resposta = exception.getResponse();

      if (typeof resposta === 'string') {
        return { ...base, statusCode: status, message: resposta, error: this.nomeErro(status) };
      }

      const objeto = resposta as Record<string, any>;
      return {
        ...base,
        statusCode: status,
        message: objeto.message ?? exception.message,
        error: objeto.error ?? this.nomeErro(status),
        codigo: objeto.codigo,
        detalhes: objeto.detalhes,
      };
    }

    if (exception instanceof QueryFailedError) {
      return this.traduzirErroBanco(exception, base);
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      error: 'Internal Server Error',
    };
  }

  private traduzirErroBanco(
    exception: QueryFailedError,
    base: { timestamp: string; path: string },
  ): RespostaErro {
    const driver = exception.driverError as { code?: string; detail?: string; column?: string };

    switch (driver?.code) {
      case '23505': // unique_violation
        return {
          ...base,
          statusCode: HttpStatus.CONFLICT,
          message: 'Já existe um registro com os mesmos dados únicos',
          error: 'Conflict',
          codigo: 'REGISTRO_DUPLICADO',
          detalhes: { detalhe: driver.detail },
        };
      case '23503': // foreign_key_violation
        return {
          ...base,
          statusCode: HttpStatus.CONFLICT,
          message: 'Operação viola um relacionamento existente',
          error: 'Conflict',
          codigo: 'VIOLACAO_RELACIONAMENTO',
          detalhes: { detalhe: driver.detail },
        };
      case '23502': // not_null_violation
        return {
          ...base,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Campo obrigatório não informado: ${driver.column ?? 'desconhecido'}`,
          error: 'Bad Request',
          codigo: 'CAMPO_OBRIGATORIO',
        };
      default:
        return {
          ...base,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro ao acessar o banco de dados',
          error: 'Internal Server Error',
          codigo: 'ERRO_BANCO',
        };
    }
  }

  private nomeErro(status: number): string {
    return NOMES_HTTP[status] ?? 'Error';
  }
}
