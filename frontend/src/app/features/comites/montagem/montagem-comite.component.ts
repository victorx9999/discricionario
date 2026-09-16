import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, switchMap } from 'rxjs';
import { CicloStore } from '../../../core/ciclo/ciclo.store';
import { UsuariosService } from '../../../core/http/catalogo.service';
import { ComitesService } from '../../../core/http/comites.service';
import { erroApiDe } from '../../../core/http/interceptors';
import { ParticipantesService } from '../../../core/http/participantes.service';
import {
  Comite,
  LayoutComite,
  mensagemDoErro,
  ParticipanteLinha,
  TipoComite,
  Usuario,
} from '../../../core/models/api.models';
import { PersonalizarComiteComponent } from '../../../shared/componentes/personalizar-comite.component';
import { MoedaPipe } from '../../../shared/pipes/formatos.pipe';

/**
 * Montagem do comitê, em quatro passos.
 *
 * O passo 2 é o que importa: conforme as pessoas entram, o pool do grupo é
 * recalculado — 1% da soma dos VLR_TEÓRICO. Esse é o teto que a consultoria vai
 * ter para distribuir, então vale ver o número crescer enquanto se decide quem
 * entra. O cálculo aqui é só a projeção da tela; o pool oficial é o que a API
 * devolve depois que o comitê existe.
 */
@Component({
  selector: 'app-montagem-comite',
  standalone: true,
  imports: [
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    PersonalizarComiteComponent,
    MoedaPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './montagem-comite.component.html',
  styleUrl: './montagem-comite.component.scss',
})
export class MontagemComiteComponent implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly comites = inject(ComitesService);
  private readonly participantes = inject(ParticipantesService);
  private readonly usuarios = inject(UsuariosService);
  private readonly snackbar = inject(MatSnackBar);
  readonly ciclos = inject(CicloStore);

  readonly tipos: TipoComite[] = ['INSTITUCIONAL', 'COMUNIDADE', 'MISTO'];

  readonly comiteId = signal<string | null>(null);
  readonly editando = computed(() => this.comiteId() !== null);

  // Passo 1
  readonly codigo = signal('');
  readonly nome = signal('');
  readonly area = signal('');
  readonly tipo = signal<TipoComite>('INSTITUCIONAL');
  readonly descricao = signal('');

  // Passo 2
  readonly busca = signal('');
  readonly candidatos = signal<ParticipanteLinha[]>([]);
  readonly escolhidos = signal<ParticipanteLinha[]>([]);
  readonly buscando = signal(false);

  // Passo 3 e 4
  readonly layout = signal<LayoutComite | null>(null);
  readonly pessoas = signal<Usuario[]>([]);
  readonly consultoriaIds = signal<string[]>([]);
  readonly backupIds = signal<string[]>([]);

  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  private readonly buscaPedida = new Subject<string>();

  readonly dadosValidos = computed(
    () => this.codigo().trim().length > 0 && this.nome().trim().length > 0,
  );

  readonly somaTeorica = computed(() =>
    this.escolhidos().reduce((total, pessoa) => total + somaComAcrescimos(pessoa), 0),
  );

  readonly percentualPool = computed(() => this.ciclos.cicloAtual()?.percentualPool ?? 0.01);

  readonly poolProjetado = computed(
    () => Math.round(this.somaTeorica() * this.percentualPool() * 100) / 100,
  );

  readonly idsEscolhidos = computed(() => new Set(this.escolhidos().map((pessoa) => pessoa.id)));

  readonly disponiveis = computed(() =>
    this.candidatos().filter((pessoa) => !this.idsEscolhidos().has(pessoa.id)),
  );

  readonly consultoras = computed(() =>
    this.pessoas().filter((pessoa) => pessoa.perfil === 'CONSULTORIA'),
  );

  readonly apoios = computed(() =>
    this.pessoas().filter((pessoa) => pessoa.perfil !== 'CONSULTORIA'),
  );

  ngOnInit(): void {
    const id = this.rota.snapshot.paramMap.get('id');
    if (id) {
      this.comiteId.set(id);
      this.carregarExistente(id);
    }

    this.buscaPedida
      .pipe(
        debounceTime(350),
        switchMap((termo) =>
          this.participantes.pesquisar({
            search: termo,
            semComite: this.editando() ? undefined : true,
            limit: 40,
          }),
        ),
      )
      .subscribe({
        next: (resposta) => {
          this.candidatos.set(resposta.data);
          this.buscando.set(false);
        },
        error: () => {
          this.candidatos.set([]);
          this.buscando.set(false);
        },
      });

    this.usuarios.listar({ limit: 200 }).subscribe({
      next: (resposta) => this.pessoas.set(resposta.data),
      error: () => this.pessoas.set([]),
    });

    // Primeira carga sem termo: mostra quem está elegível e ainda sem comitê.
    this.pesquisar('');
  }

  private carregarExistente(id: string): void {
    this.comites.buscar(id).subscribe({
      next: (comite) => this.aplicar(comite),
      error: () => this.erro.set('Não consegui carregar este comitê.'),
    });

    this.comites.participantes(id, { limit: 500 }).subscribe({
      next: (resposta) => this.escolhidos.set(resposta.data),
      error: () => undefined,
    });

    this.comites.layout(id).subscribe({
      next: (layout) => this.layout.set(layout),
      error: () => undefined,
    });
  }

  private aplicar(comite: Comite): void {
    this.codigo.set(comite.codigo);
    this.nome.set(comite.nome);
    this.area.set(comite.area ?? '');
    this.tipo.set(comite.tipo);
    this.descricao.set(comite.descricao ?? '');

    const responsaveis = comite.responsaveis ?? [];
    this.consultoriaIds.set(
      responsaveis.filter((r) => r.papel === 'CONSULTORIA').map((r) => r.usuarioId),
    );
    this.backupIds.set(responsaveis.filter((r) => r.papel === 'BACKUP').map((r) => r.usuarioId));
  }

  pesquisar(termo: string): void {
    this.busca.set(termo);
    this.buscando.set(true);
    this.buscaPedida.next(termo);
  }

  incluir(pessoa: ParticipanteLinha): void {
    this.escolhidos.update((atuais) => [...atuais, pessoa]);
  }

  remover(id: string): void {
    this.escolhidos.update((atuais) => atuais.filter((pessoa) => pessoa.id !== id));
  }

  incluirTodos(): void {
    const novos = this.disponiveis();
    if (!novos.length) return;
    this.escolhidos.update((atuais) => [...atuais, ...novos]);
  }

  limparEscolhidos(): void {
    this.escolhidos.set([]);
  }

  /** Cria (ou atualiza) o comitê e leva para a tela dele. */
  salvar(): void {
    if (!this.dadosValidos() || this.salvando()) return;

    this.salvando.set(true);
    this.erro.set(null);

    const corpo = {
      codigo: this.codigo().trim(),
      nome: this.nome().trim(),
      area: this.area().trim() || undefined,
      tipo: this.tipo(),
      descricao: this.descricao().trim() || undefined,
      consultoriaIds: this.consultoriaIds(),
      backupIds: this.backupIds(),
      participanteIds: this.escolhidos().map((pessoa) => pessoa.id),
    };

    const id = this.comiteId();
    const requisicao = id ? this.comites.atualizar(id, corpo) : this.comites.criar(corpo);

    requisicao.subscribe({
      next: (comite) => {
        this.salvando.set(false);
        this.snackbar.open(
          id ? 'Comitê atualizado.' : 'Comitê criado com os participantes escolhidos.',
          'Fechar',
          { duration: 4000 },
        );
        void this.router.navigate(['/comites', comite.id]);
      },
      error: (falha: unknown) => {
        this.salvando.set(false);
        const api = erroApiDe(falha);
        this.erro.set(
          api?.codigo === 'PARTICIPANTE_JA_ALOCADO'
            ? (mensagemDoErro(api) ??
              'Alguém da lista já está em outro comitê deste ciclo. Remova a pessoa ou tire-a do outro comitê.')
            : (mensagemDoErro(api) ?? 'Não consegui salvar o comitê.'),
        );
      },
    });
  }

  cancelar(): void {
    void this.router.navigate(['/comites']);
  }

  aoSalvarLayout(layout: LayoutComite): void {
    this.layout.set(layout);
  }
}

/** Base do pool: o teórico do titular mais o dos acréscimos elegíveis. */
function somaComAcrescimos(pessoa: ParticipanteLinha): number {
  const acrescimos = (pessoa.acrescimos ?? [])
    .filter((acrescimo) => acrescimo.elegivel)
    .reduce((total, acrescimo) => total + acrescimo.vlrTeorico, 0);
  return pessoa.vlrTeorico + acrescimos;
}
