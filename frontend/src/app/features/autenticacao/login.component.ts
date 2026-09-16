import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { erroApiDe } from '../../core/http/interceptors';

/** Entrada no sistema. É a única tela fora do shell. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);

  readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    senha: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly controles = this.formulario.controls;

  readonly carregando = signal(false);
  readonly mostrarSenha = signal(false);
  readonly erro = signal<string | null>(null);

  // Signal, e não `snapshot`: o interceptor navega para /login?expirou=1 mesmo
  // quando a tela de login já está montada, e o componente é reaproveitado.
  private readonly parametros = toSignal(this.rota.queryParamMap, {
    initialValue: this.rota.snapshot.queryParamMap,
  });

  readonly expirou = computed(() => this.parametros().has('expirou'));

  alternarSenha(): void {
    this.mostrarSenha.update((visivel) => !visivel);
  }

  entrar(): void {
    if (this.carregando()) return;

    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const { email, senha } = this.formulario.getRawValue();
    this.carregando.set(true);
    this.erro.set(null);

    this.auth.entrar(email, senha).subscribe({
      next: () => {
        this.carregando.set(false);
        void this.router.navigateByUrl(this.destino());
      },
      error: (falha: unknown) => {
        this.carregando.set(false);
        // Só a credencial errada vira mensagem ao lado do formulário: os demais
        // erros (API fora do ar, 500) já viram snackbar no erroInterceptor.
        const api = erroApiDe(falha);
        this.erro.set(api?.statusCode === 401 ? 'E-mail ou senha incorretos.' : null);
      },
    });
  }

  private destino(): string {
    const destino = this.parametros().get('destino');
    return destino && destino.startsWith('/') ? destino : '/painel';
  }
}
