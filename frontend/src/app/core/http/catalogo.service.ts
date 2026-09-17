import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import {
  Ciclo,
  ComparativoComites,
  Importacao,
  LayoutBase,
  Motivo,
  PremissasCiclo,
  PreviaUpload,
  ResultadoPaginado,
  Usuario,
  VisaoGeral,
} from '../models/api.models';
import { ApiService, Params } from './api.service';

/** Ciclos, motivadores, usuários, cargas e consolidação. */
@Injectable({ providedIn: 'root' })
export class CiclosService {
  private readonly api = inject(ApiService);

  listar(): Observable<Ciclo[]> {
    return this.api
      .get<ResultadoPaginado<Ciclo>>('ciclos', { limit: 500 })
      .pipe(map((resposta) => resposta.data));
  }

  anos(): Observable<number[]> {
    return this.api.get<number[]>('ciclos/anos');
  }

  ativo(): Observable<Ciclo> {
    return this.api.get<Ciclo>('ciclos/ativo');
  }

  criar(corpo: { ano: number; descricao?: string; copiarPremissasDe?: number }): Observable<Ciclo> {
    return this.api.post<Ciclo>('ciclos', corpo);
  }

  ativar(id: string): Observable<Ciclo> {
    return this.api.patch<Ciclo>(`ciclos/${id}/ativar`);
  }

  fechar(id: string): Observable<Ciclo> {
    return this.api.patch<Ciclo>(`ciclos/${id}/fechar`);
  }

  reabrir(id: string): Observable<Ciclo> {
    return this.api.patch<Ciclo>(`ciclos/${id}/reabrir`);
  }

  salvarPremissas(id: string, premissas: PremissasCiclo): Observable<Ciclo> {
    return this.api.patch<Ciclo>(`ciclos/${id}/premissas`, premissas);
  }
}

@Injectable({ providedIn: 'root' })
export class MotivosService {
  private readonly api = inject(ApiService);
  private cacheAtivos?: Observable<Motivo[]>;

  /** Cacheado: o painel do FD pede a cada participante aberto. */
  ativos(): Observable<Motivo[]> {
    this.cacheAtivos ??= this.api
      .get<Motivo[]>('motivos/ativos')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.cacheAtivos;
  }

  listar(params?: Params): Observable<ResultadoPaginado<Motivo>> {
    return this.api.get<ResultadoPaginado<Motivo>>('motivos', params);
  }

  criar(corpo: Partial<Motivo>): Observable<Motivo> {
    this.cacheAtivos = undefined;
    return this.api.post<Motivo>('motivos', corpo);
  }

  atualizar(id: string, corpo: Partial<Motivo>): Observable<Motivo> {
    this.cacheAtivos = undefined;
    return this.api.put<Motivo>(`motivos/${id}`, corpo);
  }

  remover(id: string): Observable<void> {
    this.cacheAtivos = undefined;
    return this.api.delete<void>(`motivos/${id}`);
  }

  restaurar(id: string): Observable<Motivo> {
    this.cacheAtivos = undefined;
    return this.api.patch<Motivo>(`motivos/${id}/restore`);
  }
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly api = inject(ApiService);

  listar(params?: Params): Observable<ResultadoPaginado<Usuario>> {
    return this.api.get<ResultadoPaginado<Usuario>>('usuarios', params);
  }

  criar(corpo: Partial<Usuario> & { senha?: string }): Observable<Usuario> {
    return this.api.post<Usuario>('usuarios', corpo);
  }

  atualizar(id: string, corpo: Partial<Usuario>): Observable<Usuario> {
    return this.api.put<Usuario>(`usuarios/${id}`, corpo);
  }
}

@Injectable({ providedIn: 'root' })
export class UploadsService {
  private readonly api = inject(ApiService);

  layouts(): Observable<LayoutBase[]> {
    return this.api.get<LayoutBase[]>('uploads/layouts');
  }

  /** Prévia sem gravar nada — é o passo que evita carga errada. */
  previa(arquivo: File, tipoBase: string, modo: string): Observable<PreviaUpload> {
    const formulario = new FormData();
    formulario.append('file', arquivo, arquivo.name);
    formulario.append('tipoBase', tipoBase);
    formulario.append('modo', modo);
    return this.api.upload<PreviaUpload>('uploads/previa', formulario);
  }

  processar(
    arquivo: File,
    tipoBase: string,
    modo: string,
    opcoes: { confirmarReinicioDoCiclo?: boolean; vincularPorGrupoRanking?: boolean } = {},
  ): Observable<Importacao> {
    const formulario = new FormData();
    formulario.append('file', arquivo, arquivo.name);
    formulario.append('tipoBase', tipoBase);
    formulario.append('modo', modo);
    if (opcoes.confirmarReinicioDoCiclo !== undefined) {
      formulario.append('confirmarReinicioDoCiclo', String(opcoes.confirmarReinicioDoCiclo));
    }
    if (opcoes.vincularPorGrupoRanking !== undefined) {
      formulario.append('vincularPorGrupoRanking', String(opcoes.vincularPorGrupoRanking));
    }
    return this.api.upload<Importacao>('uploads', formulario);
  }

  historico(params?: Params): Observable<ResultadoPaginado<Importacao>> {
    return this.api.get<ResultadoPaginado<Importacao>>('uploads', params);
  }

  erros(id: string, params?: Params): Observable<ResultadoPaginado<Record<string, unknown>>> {
    return this.api.get<ResultadoPaginado<Record<string, unknown>>>(`uploads/${id}/erros`, params);
  }
}

@Injectable({ providedIn: 'root' })
export class ConsolidacaoService {
  private readonly api = inject(ApiService);

  visaoGeral(): Observable<VisaoGeral> {
    return this.api.get<VisaoGeral>('consolidacao/visao-geral');
  }

  comparativo(comiteIds: string[]): Observable<ComparativoComites> {
    // A API espera os IDs juntos numa única string separada por vírgula — mandar
    // como array faz o ApiService repetir o parâmetro (?comites=a&comites=b), que
    // o backend não sabe interpretar.
    return this.api.get<ComparativoComites>('consolidacao/comparativo', {
      comites: comiteIds.join(','),
    });
  }

  nominais(): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>('consolidacao/discricionarios-nominais');
  }

  controleDeGrupos(): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>('consolidacao/controle-grupos');
  }
}
