import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { CicloStore } from '../ciclo/ciclo.store';
import { ErroApi, mensagemDoErro } from '../models/api.models';

/** Anexa o Bearer token em toda chamada autenticada. */
export const tokenInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
  const auth = inject(AuthService);
  const token = auth.token();

  if (!token || requisicao.url.includes('/auth/login')) {
    return proximo(requisicao);
  }

  return proximo(
    requisicao.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};

/**
 * Injeta `?ciclo=` em toda chamada.
 *
 * É o que faz o histórico por ano funcionar sem cada tela se preocupar com isso.
 * Rotas que não pertencem a um ciclo (auth, usuários, motivadores, o próprio
 * /ciclos) ficam de fora, e uma chamada que já traz `ciclo` explícito é respeitada.
 */
const SEM_CICLO = ['/auth/', '/usuarios', '/motivos', '/ciclos'];

export const cicloInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
  const ciclos = inject(CicloStore);
  const ano = ciclos.ano();

  const fora = SEM_CICLO.some((trecho) => requisicao.url.includes(trecho));
  if (ano === null || fora || requisicao.params.has('ciclo')) {
    return proximo(requisicao);
  }

  return proximo(requisicao.clone({ params: requisicao.params.set('ciclo', String(ano)) }));
};

/**
 * Traduz o contrato de erro da API.
 *
 * Erros que a tela sabe tratar (pool estourado, FD fora do limite, participante
 * já alocado) são repassados para quem chamou — quem mostra o detalhe é o
 * componente, com o número na mão. O resto vira snackbar aqui, uma vez só.
 */
const TRATADOS_NA_TELA = new Set([
  'POOL_EXCEDIDO',
  'FD_FORA_DO_LIMITE',
  'PARTICIPANTE_JA_ALOCADO',
  'JUSTIFICATIVA_OBRIGATORIA',
  'MOTIVADOR_OBRIGATORIO',
  'CONFIRMACAO_NECESSARIA',
  'COMITE_CONCLUIDO',
  'CICLO_FECHADO',
]);

export const erroInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
  const snackbar = inject(MatSnackBar);
  const auth = inject(AuthService);
  const router = inject(Router);

  return proximo(requisicao).pipe(
    catchError((erro: HttpErrorResponse) => {
      const corpo = (erro.error ?? {}) as Partial<ErroApi>;
      const codigo = corpo.codigo ?? '';

      if (erro.status === 401 && !requisicao.url.includes('/auth/login')) {
        auth.limpar();
        void router.navigate(['/login'], { queryParams: { expirou: 1 } });
        return throwError(() => erro);
      }

      if (TRATADOS_NA_TELA.has(codigo)) {
        return throwError(() => erro);
      }

      snackbar.open(mensagemDe(erro, corpo), 'Fechar', {
        duration: 7000,
        panelClass: 'snackbar-erro',
      });

      return throwError(() => erro);
    }),
  );
};

function mensagemDe(erro: HttpErrorResponse, corpo: Partial<ErroApi>): string {
  const daApi = mensagemDoErro(corpo);

  if (erro.status === 0) {
    return 'Não consegui falar com a API. Verifique se o backend está no ar.';
  }
  if (erro.status === 403) {
    return daApi ?? 'Seu perfil não tem acesso a esta ação.';
  }
  if (erro.status === 404) {
    return daApi ?? 'Registro não encontrado neste ciclo.';
  }
  if (erro.status === 413) {
    return 'Arquivo maior que o limite configurado na API.';
  }
  return daApi ?? 'Algo deu errado ao falar com a API.';
}

/** Extrai o corpo tipado de um erro HTTP, para a tela tratar pelo código. */
export function erroApiDe(erro: unknown): ErroApi | null {
  if (erro instanceof HttpErrorResponse && erro.error && typeof erro.error === 'object') {
    return erro.error as ErroApi;
  }
  return null;
}
