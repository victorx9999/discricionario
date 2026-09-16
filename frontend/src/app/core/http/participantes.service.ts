import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DefinicaoColuna,
  GraficosParticipante,
  LancarDiscricionario,
  OpcoesFiltro,
  ParticipanteLinha,
  ResultadoPaginado,
} from '../models/api.models';
import { ApiService, Params } from './api.service';

@Injectable({ providedIn: 'root' })
export class ParticipantesService {
  private readonly api = inject(ApiService);

  listar(params?: Params): Observable<ResultadoPaginado<ParticipanteLinha>> {
    return this.api.get<ResultadoPaginado<ParticipanteLinha>>('participantes', params);
  }

  /** Catálogo completo de campos — alimenta a tabela e o painel. */
  catalogo(): Observable<DefinicaoColuna[]> {
    return this.api.get<DefinicaoColuna[]>('participantes/colunas');
  }

  opcoesFiltro(): Observable<OpcoesFiltro> {
    return this.api.get<OpcoesFiltro>('participantes/filtros');
  }

  /**
   * Ids na mesma ordem da tabela. É o que faz "anterior / próximo" navegar sem
   * pular ninguém, mesmo com filtro e ordenação aplicados.
   */
  ids(params?: Params): Observable<string[]> {
    return this.api.get<string[]>('participantes/ids', params);
  }

  /** Busca usada ao montar o comitê: nome, EMPLID, área ou nível. */
  pesquisar(params?: Params): Observable<ResultadoPaginado<ParticipanteLinha>> {
    return this.api.get<ResultadoPaginado<ParticipanteLinha>>('participantes', params);
  }

  detalhar(id: string): Observable<ParticipanteLinha> {
    return this.api.get<ParticipanteLinha>(`participantes/${id}`);
  }

  graficos(id: string): Observable<GraficosParticipante> {
    return this.api.get<GraficosParticipante>(`participantes/${id}/graficos`);
  }

  lancarDiscricionario(id: string, corpo: LancarDiscricionario): Observable<ParticipanteLinha> {
    return this.api.patch<ParticipanteLinha>(`participantes/${id}/discricionario`, corpo);
  }

  removerDiscricionario(id: string): Observable<ParticipanteLinha> {
    return this.api.delete<ParticipanteLinha>(`participantes/${id}/discricionario`);
  }
}
