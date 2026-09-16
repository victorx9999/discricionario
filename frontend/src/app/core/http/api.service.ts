import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Valores aceitos num query param. `undefined` e `null` são descartados. */
export type ValorParam = string | number | boolean | undefined | null;
export type Params = Record<string, ValorParam | ValorParam[]>;

/**
 * Cliente HTTP da API.
 *
 * Só monta URL e query string. O token e o `?ciclo=` entram pelos interceptors,
 * e o tratamento de erro é do `erroInterceptor` — por isso aqui não há `catchError`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get<T>(caminho: string, params?: Params): Observable<T> {
    return this.http.get<T>(this.url(caminho), { params: this.montarParams(params) });
  }

  post<T>(caminho: string, corpo?: unknown, params?: Params): Observable<T> {
    return this.http.post<T>(this.url(caminho), corpo ?? {}, { params: this.montarParams(params) });
  }

  put<T>(caminho: string, corpo?: unknown, params?: Params): Observable<T> {
    return this.http.put<T>(this.url(caminho), corpo ?? {}, { params: this.montarParams(params) });
  }

  patch<T>(caminho: string, corpo?: unknown, params?: Params): Observable<T> {
    return this.http.patch<T>(this.url(caminho), corpo ?? {}, { params: this.montarParams(params) });
  }

  delete<T>(caminho: string, params?: Params): Observable<T> {
    return this.http.delete<T>(this.url(caminho), { params: this.montarParams(params) });
  }

  /** Upload multipart — o navegador define o boundary sozinho. */
  upload<T>(caminho: string, formulario: FormData, params?: Params): Observable<T> {
    return this.http.post<T>(this.url(caminho), formulario, { params: this.montarParams(params) });
  }

  private url(caminho: string): string {
    const limpo = caminho.startsWith('/') ? caminho.slice(1) : caminho;
    return `${this.base}/${limpo}`;
  }

  private montarParams(params?: Params): HttpParams {
    let http = new HttpParams();
    if (!params) return http;

    for (const [chave, valor] of Object.entries(params)) {
      if (valor === undefined || valor === null || valor === '') continue;

      if (Array.isArray(valor)) {
        for (const item of valor) {
          if (item === undefined || item === null || item === '') continue;
          http = http.append(chave, String(item));
        }
        continue;
      }

      http = http.set(chave, String(valor));
    }

    return http;
  }
}

/**
 * Monta o filtro dinâmico da API: `?filter=campo:operador:valor`.
 * Vários filtros viram várias ocorrências do parâmetro.
 */
export function filtro(campo: string, operador: string, valor: ValorParam): string {
  return `${campo}:${operador}:${String(valor)}`;
}
