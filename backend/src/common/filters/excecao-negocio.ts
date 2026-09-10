import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exceção de regra de negócio.
 *
 * Permite anexar um `codigo` estável (usado pelo frontend para tratar
 * cenários específicos) e `detalhes` livres, mantendo o contrato de erro
 * padronizado da API.
 */
export class ExcecaoNegocio extends HttpException {
  constructor(
    message: string,
    readonly codigo: string = 'REGRA_NEGOCIO',
    readonly detalhes?: Record<string, unknown>,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super({ message, codigo, detalhes }, status);
  }
}

/** Erro específico de estouro/violação das regras do pool. */
export class ExcecaoPool extends ExcecaoNegocio {
  constructor(message: string, detalhes?: Record<string, unknown>) {
    super(message, 'POOL_EXCEDIDO', detalhes, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** Erro específico de validação do valor de discricionário. */
export class ExcecaoDiscricionarioInvalido extends ExcecaoNegocio {
  constructor(message: string, detalhes?: Record<string, unknown>) {
    super(message, 'DISCRICIONARIO_INVALIDO', detalhes, HttpStatus.BAD_REQUEST);
  }
}

/** Erro específico do processamento de arquivos de upload. */
export class ExcecaoUpload extends ExcecaoNegocio {
  constructor(message: string, detalhes?: Record<string, unknown>) {
    super(message, 'UPLOAD_INVALIDO', detalhes, HttpStatus.BAD_REQUEST);
  }
}
