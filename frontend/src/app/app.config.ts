import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  LOCALE_ID,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { rotas } from './app.routes';
import { cicloInterceptor, erroInterceptor, tokenInterceptor } from './core/http/interceptors';

registerLocaleData(localePt, 'pt-BR');

export const configuracaoApp: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      rotas,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
    // A ordem importa: o token entra primeiro, o ciclo depois, e o tratamento
    // de erro fica por último para ver a resposta de todos.
    provideHttpClient(withInterceptors([tokenInterceptor, cicloInterceptor, erroInterceptor])),
    provideAnimationsAsync(),
    // O `MatSnackBar` é `providedIn: MatSnackBarModule`, e o `erroInterceptor`
    // o injeta em toda requisição. Sem o módulo no injetor raiz, a primeira
    // chamada à API estoura com NullInjectorError.
    importProvidersFrom(MatSnackBarModule),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
  ],
};
