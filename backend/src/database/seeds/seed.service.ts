import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PapelResponsavel, PerfilUsuario, StatusAnalise, StatusComite, StatusGrupo } from '../../common/enums';
import { paraDecimal, paraMoeda } from '../../common/utils';
import { AnaliseParticipante } from '../../comites/entities/analise-participante.entity';
import { Comite } from '../../comites/entities/comite.entity';
import {
  AVALIACOES_COMPORTAMENTAIS_PADRAO,
  AvaliacaoComportamental,
} from '../../discricionario/entities/avaliacao-comportamental.entity';
import { Discricionario } from '../../discricionario/entities/discricionario.entity';
import { CalculoService } from '../../discricionario/services/calculo.service';
import { GrupoResponsavel } from '../../grupos/entities/grupo-responsavel.entity';
import { Grupo } from '../../grupos/entities/grupo.entity';
import { AcrescimoParticipante } from '../../participantes/entities/acrescimo-participante.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { UsuariosService } from '../../usuarios/usuarios.service';
import {
  AREAS,
  CARGOS,
  Gerador,
  MODELOS_AVALIACAO,
  NIVEIS_CARGO,
  PRIMEIROS_NOMES,
  SOBRENOMES,
  criarGerador,
} from './dados-ficticios';

export interface OpcoesSeed {
  /** Limpa as tabelas antes de popular. */
  reset?: boolean;
  /** Quantidade de participantes fictícios. */
  quantidadeParticipantes?: number;
  /** Senha usada em todos os usuários de exemplo. */
  senhaPadrao?: string;
}

const TABELAS_LIMPEZA = [
  'auditoria_logs',
  'discricionarios',
  'analises_participante',
  'comites',
  'grupo_participantes',
  'grupo_responsaveis',
  'grupos',
  'acrescimos_participante',
  'participantes',
  'erros_importacao',
  'importacoes',
  'usuarios',
];

/**
 * Popula o banco local com massa FICTÍCIA de desenvolvimento.
 *
 * O volume é suficiente para exercitar paginação, busca, filtros, cálculos,
 * pool, navegação participante a participante e o resumo por nível de cargo.
 */
export class SeedService {
  private readonly logger = new Logger('Seed');
  private readonly calculoService = new CalculoService();

  constructor(private readonly dataSource: DataSource) {}

  async executar(opcoes: OpcoesSeed = {}): Promise<void> {
    const quantidade = opcoes.quantidadeParticipantes ?? 1500;
    const senha = opcoes.senhaPadrao ?? 'Senha@123';
    const gerador = criarGerador();

    this.logger.warn('Os dados gerados são FICTÍCIOS e destinam-se apenas a desenvolvimento/testes.');

    await this.dataSource.transaction(async (manager) => {
      if (opcoes.reset) {
        await this.limpar(manager);
      }

      await this.garantirAvaliacoes(manager);

      const usuarios = await this.criarUsuarios(manager, senha);
      const participantes = await this.criarParticipantes(manager, gerador, quantidade);
      await this.criarAcrescimos(manager, gerador, participantes);
      const grupos = await this.criarGrupos(manager, gerador, usuarios, participantes);
      const comites = await this.criarComites(manager, grupos);
      await this.criarDiscricionarios(manager, gerador, comites, usuarios[0]);
    });

    this.logger.log('Seed concluído com sucesso.');
    this.logger.log(`Acesso administrador: admin@discricionario.local / ${senha}`);
  }

  // ------------------------------------------------------------------
  // Etapas
  // ------------------------------------------------------------------

  private async limpar(manager: EntityManager): Promise<void> {
    await manager.query(`TRUNCATE TABLE ${TABELAS_LIMPEZA.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    this.logger.log('Tabelas limpas.');
  }

  private async garantirAvaliacoes(manager: EntityManager): Promise<void> {
    for (const avaliacao of AVALIACOES_COMPORTAMENTAIS_PADRAO) {
      const existente = await manager.findOne(AvaliacaoComportamental, {
        where: { codigo: avaliacao.codigo },
      });
      if (!existente) {
        await manager.save(manager.create(AvaliacaoComportamental, avaliacao));
      }
    }
  }

  private async criarUsuarios(manager: EntityManager, senha: string): Promise<Usuario[]> {
    const senhaHash = await UsuariosService.gerarHash(senha);

    const definicoes = [
      { nome: 'Administrador do Sistema', email: 'admin@discricionario.local', perfil: PerfilUsuario.ADMIN },
      { nome: 'Atendimento Um', email: 'atendimento1@discricionario.local', perfil: PerfilUsuario.ATENDIMENTO },
      { nome: 'Atendimento Dois', email: 'atendimento2@discricionario.local', perfil: PerfilUsuario.ATENDIMENTO },
      { nome: 'Consultoria Um', email: 'consultoria1@discricionario.local', perfil: PerfilUsuario.CONSULTORIA },
      { nome: 'Consultoria Dois', email: 'consultoria2@discricionario.local', perfil: PerfilUsuario.CONSULTORIA },
    ];

    const usuarios: Usuario[] = [];
    for (const definicao of definicoes) {
      const existente = await manager.findOne(Usuario, { where: { email: definicao.email } });
      usuarios.push(
        existente ?? (await manager.save(manager.create(Usuario, { ...definicao, senhaHash, ativo: true }))),
      );
    }

    this.logger.log(`${usuarios.length} usuários disponíveis.`);
    return usuarios;
  }

  private async criarParticipantes(
    manager: EntityManager,
    gerador: Gerador,
    quantidade: number,
  ): Promise<Participante[]> {
    const registros: Array<Partial<Participante>> = [];

    for (let i = 0; i < quantidade; i += 1) {
      const nome = `${gerador.item(PRIMEIROS_NOMES)} ${gerador.item(SOBRENOMES)} ${gerador.item(SOBRENOMES)}`;
      const area = gerador.item(AREAS);

      // Cerca de 20% dos participantes mudaram de área no período.
      const mudouDeArea = gerador.proximo() < 0.2;
      const areaOrigem = mudouDeArea ? gerador.item(AREAS.filter((a) => a !== area)) : null;

      const valorBase = gerador.inteiro(4500, 62000);
      const fbpa = gerador.decimal(0.8, 1.2, 4);
      const fpi = gerador.decimal(0.75, 1.35, 4);

      const calculo = this.calculoService.calcularParticipante({ valorBase, fbpa, fpi, fd: 0 });

      registros.push({
        funcional: String(900000 + i),
        nome,
        cargo: gerador.item(CARGOS),
        nivelCargo: gerador.item(NIVEIS_CARGO),
        modeloAvaliacao: gerador.item(MODELOS_AVALIACAO),
        area,
        areaOrigem,
        fpi: calculo.fpi,
        fpiFinal: calculo.fpiFinal,
        fbpa,
        fd: 0,
        valorBase,
        valorPrI: calculo.valorPrI,
        valorPrF: calculo.valorPrF,
        // VLRTEORICO da área atual — base do pool.
        vlrTeorico: paraMoeda(paraDecimal(calculo.valorPrI).times(gerador.decimal(0.95, 1.15, 4))),
        ativo: true,
      });
    }

    const salvos: Participante[] = [];
    for (let i = 0; i < registros.length; i += 500) {
      salvos.push(...(await manager.save(Participante, registros.slice(i, i + 500) as Participante[])));
    }

    this.logger.log(`${salvos.length} participantes fictícios criados.`);
    return salvos;
  }

  private async criarAcrescimos(
    manager: EntityManager,
    gerador: Gerador,
    participantes: Participante[],
  ): Promise<void> {
    const comAcrescimo = participantes.filter((participante) => participante.areaOrigem);
    const registros = comAcrescimo.map((participante) => ({
      participanteId: participante.id,
      areaOrigem: participante.areaOrigem,
      valorAcrescimoPrI: paraMoeda(paraDecimal(participante.valorPrI).times(gerador.decimal(0.05, 0.3, 4))),
      valorAcrescimoPrF: paraMoeda(paraDecimal(participante.valorPrF).times(gerador.decimal(0.05, 0.3, 4))),
      observacao: 'Acréscimo fictício referente a período em outra área',
    }));

    for (let i = 0; i < registros.length; i += 500) {
      await manager.insert(AcrescimoParticipante, registros.slice(i, i + 500));
    }

    this.logger.log(`${registros.length} acréscimos criados (participantes que passaram por mais de uma área).`);
  }

  private async criarGrupos(
    manager: EntityManager,
    gerador: Gerador,
    usuarios: Usuario[],
    participantes: Participante[],
  ): Promise<Grupo[]> {
    const [admin, atendimento1, atendimento2, consultoria1, consultoria2] = usuarios;

    const definicoes = [
      { nome: 'Grupo Tecnologia', codigo: 'GRP-TEC', areas: ['Tecnologia'] },
      { nome: 'Grupo Negócios', codigo: 'GRP-NEG', areas: ['Comercial', 'Marketing'] },
      { nome: 'Grupo Corporativo', codigo: 'GRP-COR', areas: ['Financeiro', 'Recursos Humanos', 'Jurídico'] },
      { nome: 'Grupo Operações', codigo: 'GRP-OPE', areas: ['Operações'] },
    ];

    const grupos: Grupo[] = [];

    for (const definicao of definicoes) {
      const selecionados = participantes
        .filter((participante) => definicao.areas.includes(participante.area ?? ''))
        .slice(0, gerador.inteiro(80, 220));

      if (!selecionados.length) continue;

      const grupo = manager.create(Grupo, {
        nome: definicao.nome,
        codigo: definicao.codigo,
        status: StatusGrupo.ATIVO,
        descricao: `Grupo fictício de desenvolvimento — áreas: ${definicao.areas.join(', ')}`,
        criadoPorId: admin.id,
        participantes: selecionados,
        responsaveis: [
          manager.create(GrupoResponsavel, { usuarioId: consultoria1.id, papel: PapelResponsavel.CONSULTORA }),
          manager.create(GrupoResponsavel, { usuarioId: consultoria2.id, papel: PapelResponsavel.CONSULTORA }),
          manager.create(GrupoResponsavel, { usuarioId: atendimento1.id, papel: PapelResponsavel.BACKUP }),
          manager.create(GrupoResponsavel, { usuarioId: atendimento2.id, papel: PapelResponsavel.BACKUP }),
          manager.create(GrupoResponsavel, { usuarioId: admin.id, papel: PapelResponsavel.CRIADOR }),
        ],
      });

      grupos.push(await manager.save(grupo));
    }

    this.logger.log(`${grupos.length} grupos criados.`);
    return grupos;
  }

  private async criarComites(manager: EntityManager, grupos: Grupo[]): Promise<Comite[]> {
    const comites: Comite[] = [];

    for (const grupo of grupos) {
      const comite = await manager.save(
        manager.create(Comite, {
          nome: `Comitê ${grupo.nome.replace('Grupo ', '')} — Ciclo 2026`,
          codigo: grupo.codigo.replace('GRP', 'COM'),
          grupoId: grupo.id,
          status: StatusComite.EM_ANDAMENTO,
          descricao: 'Comitê fictício de desenvolvimento',
          criadoPorId: grupo.criadoPorId,
        }),
      );

      const ordenados = [...grupo.participantes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      await manager.insert(
        AnaliseParticipante,
        ordenados.map((participante, indice) => ({
          comiteId: comite.id,
          participanteId: participante.id,
          ordem: indice + 1,
          status: StatusAnalise.PENDENTE,
        })),
      );

      comites.push(comite);
    }

    this.logger.log(`${comites.length} comitês criados com a navegação montada.`);
    return comites;
  }

  /**
   * Lança discricionários em parte dos participantes, sempre respeitando o
   * pool do comitê — a massa gerada nunca nasce em estado inválido.
   */
  private async criarDiscricionarios(
    manager: EntityManager,
    gerador: Gerador,
    comites: Comite[],
    usuario: Usuario,
  ): Promise<void> {
    const avaliacoes = await manager.find(AvaliacaoComportamental, { order: { ordem: 'ASC' } });
    let totalLancamentos = 0;

    for (const comite of comites) {
      const analises = await manager.find(AnaliseParticipante, {
        where: { comiteId: comite.id },
        relations: { participante: true },
        order: { ordem: 'ASC' },
      });

      const vlrTeoricoTotal = analises.reduce(
        (acumulado, analise) => acumulado.plus(paraDecimal(analise.participante.vlrTeorico)),
        paraDecimal(0),
      );
      const poolTotal = this.calculoService.calcularPoolTotal(vlrTeoricoTotal.toNumber());

      let poolUtilizado = 0;

      for (const analise of analises) {
        // ~60% dos participantes recebem lançamento; o restante fica pendente
        // para exercitar a navegação e o resumo.
        if (gerador.proximo() > 0.6) continue;

        const positivo = gerador.proximo() < 0.55;
        const valorFd = gerador.decimal(0.005, 0.05, 4) * (positivo ? 1 : -1);

        const calculo = this.calculoService.calcularParticipante({
          valorBase: analise.participante.valorBase,
          fbpa: analise.participante.fbpa,
          fpi: analise.participante.fpi,
          fd: valorFd,
        });

        // Não estoura o pool: o lançamento positivo só entra se couber.
        if (calculo.impactoFinanceiro > 0 && poolUtilizado + calculo.impactoFinanceiro > poolTotal) {
          continue;
        }
        poolUtilizado = paraMoeda(poolUtilizado + calculo.impactoFinanceiro);

        await manager.save(
          manager.create(Discricionario, {
            analiseId: analise.id,
            valorFd: calculo.fd,
            avaliacaoComportamentalId: gerador.item(avaliacoes).id,
            justificativa: positivo
              ? 'Reconhecimento de entregas acima do esperado no ciclo (dado fictício).'
              : 'Ajuste de posicionamento frente ao grupo comparativo (dado fictício).',
            fpiFinalCalculado: calculo.fpiFinal,
            valorPrICalculado: calculo.valorPrI,
            valorPrFCalculado: calculo.valorPrF,
            impactoFinanceiro: calculo.impactoFinanceiro,
            criadoPorId: usuario.id,
            atualizadoPorId: usuario.id,
          }),
        );

        await manager.update(
          AnaliseParticipante,
          { id: analise.id },
          { status: StatusAnalise.ANALISADO, analisadoPorId: usuario.id, analisadoEm: new Date() },
        );

        totalLancamentos += 1;
      }

      this.logger.log(
        `Comitê ${comite.codigo}: pool R$ ${poolTotal.toFixed(2)} | utilizado R$ ${poolUtilizado.toFixed(2)}`,
      );
    }

    this.logger.log(`${totalLancamentos} discricionários lançados.`);
  }
}
