import { ApiProperty } from '@nestjs/swagger';

/** Envelope padrão de resposta paginada da API. */
export class ResultadoPaginado<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 13000 })
  total: number;

  @ApiProperty({ example: 260 })
  totalPages: number;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  }

  /** Cria o envelope a partir do retorno de `findAndCount` do TypeORM. */
  static de<T>([data, total]: [T[], number], query: { page?: number; limit?: number }): ResultadoPaginado<T> {
    return new ResultadoPaginado<T>(data, total, query.page ?? 1, query.limit ?? 50);
  }

  /** Aplica uma transformação aos itens preservando os metadados de paginação. */
  mapear<R>(fn: (item: T) => R): ResultadoPaginado<R> {
    return new ResultadoPaginado<R>(this.data.map(fn), this.total, this.page, this.limit);
  }
}
