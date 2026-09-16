import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Ata,
  Comite,
  ContextoColuna,
  CriarComite,
  LayoutComite,
  LayoutContexto,
  ParticipanteLinha,
  Pendencias,
  ResultadoPaginado,
  ResultadoPool,
  ResumoComite,
  SalvarColunas,
} from '../models/api.models';
import { ApiService, Params } from './api.service';

/** Tudo que a tela do comitê e a montagem consomem. */
@Injectable({ providedIn: 'root' })
export class ComitesService {
  private readonly api = inject(ApiService);

  listar(params?: Params): Observable<ResultadoPaginado<Comite>> {
    return this.api.get<ResultadoPaginado<Comite>>('comites', params);
  }

  buscar(id: string): Observable<Comite> {
    return this.api.get<Comite>(`comites/${id}`);
  }

  participantes(id: string, params?: Params): Observable<ResultadoPaginado<ParticipanteLinha>> {
    return this.api.get<ResultadoPaginado<ParticipanteLinha>>(`comites/${id}/participantes`, params);
  }

  resumo(id: string): Observable<ResumoComite> {
    return this.api.get<ResumoComite>(`comites/${id}/resumo`);
  }

  pool(id: string): Observable<ResultadoPool> {
    return this.api.get<ResultadoPool>(`comites/${id}/pool`);
  }

  discricionarios(id: string, params?: Params): Observable<ResultadoPaginado<ParticipanteLinha>> {
    return this.api.get<ResultadoPaginado<ParticipanteLinha>>(
      `comites/${id}/discricionarios`,
      params,
    );
  }

  pendencias(id: string): Observable<Pendencias> {
    return this.api.get<Pendencias>(`comites/${id}/pendencias`);
  }

  // -------------------------------------------------------------------------
  // Layout: colunas da tabela e campos do painel
  // -------------------------------------------------------------------------

  /** Os dois contextos de uma vez — é o que a tela carrega ao abrir. */
  layout(id: string): Observable<LayoutComite> {
    return this.api.get<LayoutComite>(`comites/${id}/colunas`);
  }

  layoutDe(id: string, contexto: ContextoColuna): Observable<LayoutContexto> {
    return this.api.get<LayoutContexto>(`comites/${id}/colunas`, { contexto });
  }

  salvarLayout(id: string, corpo: SalvarColunas): Observable<LayoutContexto> {
    return this.api.put<LayoutContexto>(`comites/${id}/colunas`, corpo);
  }

  restaurarLayout(id: string, contexto?: ContextoColuna): Observable<LayoutComite | LayoutContexto> {
    return this.api.delete<LayoutComite | LayoutContexto>(`comites/${id}/colunas`, { contexto });
  }

  // -------------------------------------------------------------------------
  // ATA e ciclo de vida
  // -------------------------------------------------------------------------

  ata(id: string): Observable<Ata> {
    return this.api.get<Ata>(`comites/${id}/ata`);
  }

  salvarAta(id: string, ata: Ata): Observable<Ata> {
    return this.api.put<Ata>(`comites/${id}/ata`, ata);
  }

  concluir(id: string, corpo?: { observacoes?: string }): Observable<Comite> {
    return this.api.patch<Comite>(`comites/${id}/concluir`, corpo ?? {});
  }

  reabrir(id: string, motivo?: string): Observable<Comite> {
    return this.api.patch<Comite>(`comites/${id}/reabrir`, { motivo });
  }

  // -------------------------------------------------------------------------
  // Montagem
  // -------------------------------------------------------------------------

  criar(corpo: CriarComite): Observable<Comite> {
    return this.api.post<Comite>('comites', corpo);
  }

  atualizar(id: string, corpo: Partial<CriarComite>): Observable<Comite> {
    return this.api.put<Comite>(`comites/${id}`, corpo);
  }

  adicionarParticipantes(id: string, participanteIds: string[]): Observable<{ vinculados: number }> {
    return this.api.post<{ vinculados: number }>(`comites/${id}/participantes`, { participanteIds });
  }

  removerParticipantes(id: string, participanteIds: string[]): Observable<{ removidos: number }> {
    return this.api.delete<{ removidos: number }>(`comites/${id}/participantes`, {
      participanteIds,
    });
  }

  remover(id: string): Observable<void> {
    return this.api.delete<void>(`comites/${id}`);
  }

  restaurar(id: string): Observable<Comite> {
    return this.api.patch<Comite>(`comites/${id}/restore`);
  }
}
