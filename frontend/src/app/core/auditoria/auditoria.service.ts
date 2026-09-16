import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../http/api.service';
import { EventoFrontend, LogAuditoria, ResultadoPaginado } from '../models/api.models';

/**
 * Trilha de auditoria.
 *
 * Além de ler o log do backend, manda para `POST /audit` os eventos que só
 * existem na tela — comitê aberto, participante visualizado, layout alterado,
 * exportação feita. Junto com a trilha do servidor, dá para reconstruir a
 * reunião inteira: quem viu o quê, em que ordem, e o que mudou.
 *
 * Registrar é "melhor esforço": uma falha aqui nunca pode atrapalhar o usuário,
 * então o erro é engolido de propósito.
 */
@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly api = inject(ApiService);

  registrar(evento: EventoFrontend): void {
    this.api.post('audit', evento).subscribe({ error: () => undefined });
  }

  comiteAberto(comiteId: string, nome: string): void {
    this.registrar({
      acao: 'COMITE_ABERTO',
      entidade: 'COMITE',
      entidadeId: comiteId,
      comiteId,
      detalhes: { nome },
    });
  }

  participanteVisualizado(comiteId: string, participanteId: string, nome: string): void {
    this.registrar({
      acao: 'PARTICIPANTE_VISUALIZADO',
      entidade: 'PARTICIPANTE',
      entidadeId: participanteId,
      comiteId,
      detalhes: { nome },
    });
  }

  exportou(comiteId: string, formato: string, linhas: number): void {
    this.registrar({
      acao: 'EXPORTACAO',
      entidade: 'COMITE',
      entidadeId: comiteId,
      comiteId,
      detalhes: { formato, linhas },
    });
  }

  consultar(params: Record<string, string | number | undefined>): Observable<ResultadoPaginado<LogAuditoria>> {
    return this.api.get<ResultadoPaginado<LogAuditoria>>('audit', params);
  }

  historicoDoParticipante(comiteId: string, participanteId: string): Observable<LogAuditoria[]> {
    return this.api.get<LogAuditoria[]>(
      `audit/comites/${comiteId}/participantes/${participanteId}`,
    );
  }
}
