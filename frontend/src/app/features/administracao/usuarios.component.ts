import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { UsuariosService } from '../../core/http/catalogo.service';
import { erroApiDe } from '../../core/http/interceptors';
import { mensagemDoErro, PerfilUsuario, Usuario } from '../../core/models/api.models';

const PERFIS: PerfilUsuario[] = ['ADMIN', 'ATENDIMENTO', 'CONSULTORIA'];

const ROTULO_PERFIL: Record<PerfilUsuario, string> = {
  ADMIN: 'Administração',
  ATENDIMENTO: 'Atendimento',
  CONSULTORIA: 'Consultoria',
};

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss',
})
export class UsuariosComponent implements OnInit {
  private readonly usuarios = inject(UsuariosService);

  readonly perfis = PERFIS;

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly lista = signal<Usuario[]>([]);

  readonly salvando = signal(false);
  readonly erroFormulario = signal<string | null>(null);
  readonly editando = signal<Usuario | null>(null);

  readonly colunas: string[] = ['nome', 'email', 'perfil', 'ativo'];

  readonly form = new FormGroup({
    nome: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    perfil: new FormControl<PerfilUsuario>('CONSULTORIA', { nonNullable: true }),
    senha: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    ativo: new FormControl<boolean>(true, { nonNullable: true }),
  });

  readonly tituloFormulario = computed(() => {
    const usuario = this.editando();
    return usuario ? `Editar ${usuario.nome}` : 'Novo usuário';
  });

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.usuarios.listar({ limit: 200, page: 1 }).subscribe({
      next: (pagina) => {
        this.lista.set(pagina.data);
        this.carregando.set(false);
      },
      error: (erro: unknown) => {
        this.erro.set(mensagemDe(erro, 'Não consegui carregar os usuários.'));
        this.carregando.set(false);
      },
    });
  }

  editar(usuario: Usuario): void {
    this.editando.set(usuario);
    this.erroFormulario.set(null);
    this.form.setValue({
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      senha: '',
      ativo: usuario.ativo ?? true,
    });
    // A senha só é enviada na criação; na edição o campo sai do formulário.
    this.form.controls.senha.disable();
  }

  novo(): void {
    this.editando.set(null);
    this.erroFormulario.set(null);
    this.form.reset({
      nome: '',
      email: '',
      perfil: 'CONSULTORIA',
      senha: '',
      ativo: true,
    });
    this.form.controls.senha.enable();
  }

  salvar(): void {
    if (this.salvando()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const bruto = this.form.getRawValue();
    const emEdicao = this.editando();

    const requisicao = emEdicao
      ? this.usuarios.atualizar(emEdicao.id, {
          nome: bruto.nome.trim(),
          email: bruto.email.trim(),
          perfil: bruto.perfil,
          ativo: bruto.ativo,
        })
      : this.usuarios.criar({
          nome: bruto.nome.trim(),
          email: bruto.email.trim(),
          perfil: bruto.perfil,
          ativo: bruto.ativo,
          senha: bruto.senha,
        });

    this.salvando.set(true);
    this.erroFormulario.set(null);

    requisicao.subscribe({
      next: () => {
        this.salvando.set(false);
        this.novo();
        this.carregar();
      },
      error: (erro: unknown) => {
        this.erroFormulario.set(mensagemDe(erro, 'Não consegui salvar o usuário.'));
        this.salvando.set(false);
      },
    });
  }

  rotuloPerfil(perfil: PerfilUsuario): string {
    return ROTULO_PERFIL[perfil];
  }

  classePerfil(perfil: PerfilUsuario): string {
    if (perfil === 'ADMIN') return 'chip chip-marca';
    if (perfil === 'ATENDIMENTO') return 'chip chip-atencao';
    return 'chip chip-neutro';
  }
}

function mensagemDe(erro: unknown, padrao: string): string {
  return mensagemDoErro(erroApiDe(erro)) ?? padrao;
}
