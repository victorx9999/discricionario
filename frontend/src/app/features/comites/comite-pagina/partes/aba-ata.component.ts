import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UsuariosService } from '../../../../core/http/catalogo.service';
import { ComitesService } from '../../../../core/http/comites.service';
import { erroApiDe } from '../../../../core/http/interceptors';
import {
  Ata,
  AtaParticipante,
  Comite,
  mensagemDoErro,
  Pendencias,
  Usuario,
} from '../../../../core/models/api.models';

const PAPEIS = ['participante', 'condutor', 'secretário', 'convidado'] as const;
type Papel = (typeof PAPEIS)[number];

interface PresenteNaTela extends AtaParticipante {
  papel: string;
}

/**
 * ATA do comitê.
 *
 * Os presentes não são digitados: são escolhidos numa tabela de pessoas
 * (`GET /usuarios`), e cada um recebe um papel na reunião. Digitar nome à mão
 * produz grafias diferentes da mesma pessoa e inviabiliza qualquer consulta
 * depois — por isso a tabela é a única porta de entrada.
 */
@Component({
  selector: 'app-aba-ata',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aba-ata.component.html',
  styleUrl: './aba-ata.component.scss',
})
export class AbaAtaComponent implements OnInit {
  private readonly comites = inject(ComitesService);
  private readonly usuarios = inject(UsuariosService);
  private readonly snackbar = inject(MatSnackBar);

  readonly comiteId = input.required<string>();
  readonly comite = input.required<Comite>();
  readonly somenteLeitura = input(false);

  readonly comiteAtualizado = output<void>();

  readonly papeis = PAPEIS;

  readonly data = signal('');
  readonly horaInicio = signal('');
  readonly horaFim = signal('');
  readonly observacoes = signal('');
  readonly presentes = signal<PresenteNaTela[]>([]);

  readonly pendencias = signal<Pendencias | null>(null);
  readonly carregando = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  // --- seleção de presentes a partir da tabela de pessoas ---
  readonly seletorAberto = signal(false);
  readonly pessoas = signal<Usuario[]>([]);
  readonly busca = signal('');
  readonly marcados = signal<string[]>([]);
  readonly carregandoPessoas = signal(false);

  readonly concluido = computed(() => this.comite().status === 'CONCLUIDO');
  readonly travado = computed(() => this.somenteLeitura() || this.concluido());

  readonly idsPresentes = computed(() =>
    this.presentes()
      .map((presente) => presente.usuarioId)
      .filter((id): id is string => Boolean(id)),
  );

  /** A tabela do seletor só mostra quem ainda não está na lista de presentes. */
  readonly pessoasDisponiveis = computed(() => {
    const termo = this.busca().trim().toLowerCase();
    const jaEstao = new Set(this.idsPresentes());
    return this.pessoas()
      .filter((pessoa) => !jaEstao.has(pessoa.id))
      .filter((pessoa) => {
        if (!termo) return true;
        return `${pessoa.nome} ${pessoa.email} ${pessoa.perfil}`.toLowerCase().includes(termo);
      });
  });

  readonly temDataEHora = computed(
    () => Boolean(this.data()) && Boolean(this.horaInicio()) && Boolean(this.horaFim()),
  );

  readonly podeConcluir = computed(() => {
    const pendencias = this.pendencias();
    return (
      !this.travado() &&
      !this.salvando() &&
      this.temDataEHora() &&
      this.presentes().length > 0 &&
      pendencias !== null &&
      pendencias.total === 0
    );
  });

  ngOnInit(): void {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.comites.ata(this.comiteId()).subscribe({
      next: (ata) => {
        this.aplicar(ata);
        this.carregando.set(false);
      },
      error: () => {
        // Comitê sem ATA ainda é o caso normal — começa em branco.
        this.carregando.set(false);
      },
    });

    this.comites.pendencias(this.comiteId()).subscribe({
      next: (pendencias) => this.pendencias.set(pendencias),
      error: () => this.pendencias.set(null),
    });
  }

  private aplicar(ata: Ata): void {
    this.data.set(normalizarData(ata.data));
    this.horaInicio.set(ata.horaInicio ?? '');
    this.horaFim.set(ata.horaFim ?? '');
    this.observacoes.set(ata.observacoes ?? '');
    this.presentes.set(
      (ata.participantes ?? []).map((participante) => ({
        nome: participante.nome,
        usuarioId: participante.usuarioId,
        papel: participante.papel ?? 'participante',
      })),
    );
  }

  abrirSeletor(): void {
    if (this.travado()) return;
    this.seletorAberto.update((aberto) => !aberto);
    this.marcados.set([]);

    if (this.seletorAberto() && !this.pessoas().length) {
      this.carregandoPessoas.set(true);
      this.usuarios.listar({ limit: 200 }).subscribe({
        next: (resposta) => {
          this.pessoas.set(resposta.data);
          this.carregandoPessoas.set(false);
        },
        error: () => {
          this.pessoas.set([]);
          this.carregandoPessoas.set(false);
        },
      });
    }
  }

  alternarMarcado(id: string): void {
    this.marcados.update((atuais) =>
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id],
    );
  }

  estaMarcado(id: string): boolean {
    return this.marcados().includes(id);
  }

  incluirMarcados(): void {
    const escolhidos = this.pessoas().filter((pessoa) => this.marcados().includes(pessoa.id));
    if (!escolhidos.length) return;

    this.presentes.update((atuais) => [
      ...atuais,
      ...escolhidos.map((pessoa) => ({
        nome: pessoa.nome,
        usuarioId: pessoa.id,
        papel: 'participante' as Papel,
      })),
    ]);
    this.marcados.set([]);
    this.seletorAberto.set(false);
  }

  removerPresente(indice: number): void {
    if (this.travado()) return;
    this.presentes.update((atuais) => atuais.filter((_, posicao) => posicao !== indice));
  }

  trocarPapel(indice: number, papel: string): void {
    this.presentes.update((atuais) =>
      atuais.map((presente, posicao) => (posicao === indice ? { ...presente, papel } : presente)),
    );
  }

  salvar(): void {
    if (this.travado() || this.salvando()) return;

    this.salvando.set(true);
    this.erro.set(null);

    const corpo: Ata = {
      data: this.data() || undefined,
      horaInicio: this.horaInicio() || undefined,
      horaFim: this.horaFim() || undefined,
      observacoes: this.observacoes() || undefined,
      participantes: this.presentes().map((presente) => ({
        nome: presente.nome,
        usuarioId: presente.usuarioId,
        papel: presente.papel,
      })),
    };

    this.comites.salvarAta(this.comiteId(), corpo).subscribe({
      next: (ata) => {
        this.aplicar(ata);
        this.salvando.set(false);
        this.snackbar.open('ATA salva.', 'Fechar', { duration: 3000 });
      },
      error: (falha: unknown) => {
        this.salvando.set(false);
        this.erro.set(mensagemDoErro(erroApiDe(falha)) ?? 'Não consegui salvar a ATA.');
      },
    });
  }

  concluir(): void {
    if (!this.podeConcluir()) return;

    this.salvando.set(true);
    this.erro.set(null);

    this.comites.concluir(this.comiteId(), { observacoes: this.observacoes() }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.snackbar.open('Comitê concluído.', 'Fechar', { duration: 4000 });
        this.comiteAtualizado.emit();
      },
      error: (falha: unknown) => {
        this.salvando.set(false);
        this.erro.set(mensagemDoErro(erroApiDe(falha)) ?? 'Não consegui concluir o comitê.');
      },
    });
  }

  reabrir(): void {
    if (this.somenteLeitura() || this.salvando()) return;

    this.salvando.set(true);
    this.comites.reabrir(this.comiteId()).subscribe({
      next: () => {
        this.salvando.set(false);
        this.snackbar.open('Comitê reaberto.', 'Fechar', { duration: 4000 });
        this.comiteAtualizado.emit();
      },
      error: (falha: unknown) => {
        this.salvando.set(false);
        this.erro.set(mensagemDoErro(erroApiDe(falha)) ?? 'Não consegui reabrir o comitê.');
      },
    });
  }
}

/** A API devolve ISO; o input type=date quer `aaaa-mm-dd`. */
function normalizarData(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor.length >= 10 ? valor.slice(0, 10) : valor;
}
