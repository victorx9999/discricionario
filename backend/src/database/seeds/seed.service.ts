import { Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CalculoService } from '../../calculo/calculo.service';
import { Ciclo } from '../../ciclos/entities/ciclo.entity';
import {
  PapelResponsavel,
  PerfilUsuario,
  StatusCiclo,
  StatusComite,
  TipoComite,
} from '../../common/enums';
import { paraMoeda } from '../../common/utils';
import { Ata } from '../../comites/entities/ata.entity';
import { AtaParticipante } from '../../comites/entities/ata-participante.entity';
import { ComiteResponsavel } from '../../comites/entities/comite-responsavel.entity';
import { Comite } from '../../comites/entities/comite.entity';
import { MOTIVOS_PADRAO, Motivo } from '../../motivos/entities/motivo.entity';
import { Acrescimo } from '../../participantes/entities/acrescimo.entity';
import { Participante } from '../../participantes/entities/participante.entity';
import { Usuario } from '../../usuarios/entities/usuario.entity';
import { UsuariosService } from '../../usuarios/usuarios.service';
import {
  AREAS,
  CARGOS,
  CURVA_PADRAO,
  Gerador,
  GRUPOS_RANKING,
  MODELOS_AVALIACAO,
  NIVEIS_CARGO,
  PRIMEIROS_NOMES,
  SOBRENOMES,
  criarGerador,
} from './dados-ficticios';

export interface OpcoesSeed {
  reset?: boolean;
  /** Participantes por ciclo. */
  quantidadeParticipantes?: number;
  /** Anos a gerar. O último da lista fica ativo; os anteriores, fechados. */
  anos?: number[];
  senhaPadrao?: string;
}

const TABELAS_LIMPEZA = [
  'auditoria_logs',
  'acrescimos',
  'participantes',
  'erros_importacao',
  'importacoes',
  'ata_participantes',
  'atas',
  'comite_colunas',
  'comite_responsaveis',
  'comites',
  'motivos',
  'usuarios',
  'ciclos',
];

/**
 * Popula o banco local com massa FICTÍCIA.
 *
 * Gera **dois ciclos** (2025 fechado e 2026 ativo) justamente para exercitar o
 * histórico: os mesmos colaboradores existem nos dois anos, com valores e
 * decisões próprias, e recarregar 2026 não toca em 2025.
 */
export class SeedService {
  private readonly logger = new Logger('Seed');
  private readonly calculoService = new CalculoService();

  constructor(private readonly dataSource: DataSource) {}

  async executar(opcoes: OpcoesSeed = {}): Promise<void> {
    const quantidade = opcoes.quantidadeParticipantes ?? 1200;
    const anos = opcoes.anos?.length ? [...opcoes.anos].sort((a, b) => a - b) : [2025, 2026];
    const senha = opcoes.senhaPadrao ?? 'Senha@123';

    this.logger.warn('Os dados gerados são FICTÍCIOS — apenas para desenvolvimento e testes.');

    await this.dataSource.transaction(async (manager) => {
      if (opcoes.reset) await this.limpar(manager);

      const motivos = await this.garantirMotivos(manager);
      const usuarios = await this.criarUsuarios(manager, senha);

      // A mesma massa de pessoas atravessa os anos: é o que prova o histórico.
      const pessoas = this.gerarPessoas(criarGerador(), quantidade);

      for (const [indice, ano] of anos.entries()) {
        const ehUltimo = indice === anos.length - 1;
        const ciclo = await this.criarCiclo(manager, ano, ehUltimo);

        const participantes = await this.criarParticipantes(manager, ciclo, pessoas, ano);
        await this.criarAcrescimos(manager, ciclo, participantes, criarGerador(ano));
        const comites = await this.criarComites(manager, ciclo, usuarios, participantes);
        await this.lancarDiscricionarios(manager, ciclo, comites, usuarios[0], criarGerador(ano + 7));
        await this.criarAtas(manager, ciclo, comites, usuarios, ehUltimo);
      }
    });

    this.logger.log('Seed concluído.');
    this.logger.log(`Ciclos gerados: ${anos.join(', ')} (ativo: ${anos[anos.length - 1]})`);
    this.logger.log(`Acesso administrador: admin@discricionario.local / ${senha}`);
  }

  // ------------------------------------------------------------------
  // Etapas
  // ------------------------------------------------------------------

  private async limpar(manager: EntityManager): Promise<void> {
    await manager.query(
      `TRUNCATE TABLE ${TABELAS_LIMPEZA.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    this.logger.log('Tabelas limpas.');
  }

  private async garantirMotivos(manager: EntityManager): Promise<Motivo[]> {
    for (const motivo of MOTIVOS_PADRAO) {
      const existente = await manager.findOne(Motivo, { where: { codigo: motivo.codigo } });
      if (!existente) await manager.save(manager.create(Motivo, motivo));
    }
    return manager.find(Motivo, { order: { ordem: 'ASC' } });
  }

  private async criarUsuarios(manager: EntityManager, senha: string): Promise<Usuario[]> {
    const senhaHash = await UsuariosService.gerarHash(senha);

    const definicoes = [
      { nome: 'Administrador do Sistema', email: 'admin@discricionario.local', perfil: PerfilUsuario.ADMIN },
      { nome: 'Bruna Atendimento', email: 'atendimento1@discricionario.local', perfil: PerfilUsuario.ATENDIMENTO },
      { nome: 'Shirley Rocha', email: 'atendimento2@discricionario.local', perfil: PerfilUsuario.ATENDIMENTO },
      { nome: 'Maria Silva', email: 'consultoria1@discricionario.local', perfil: PerfilUsuario.CONSULTORIA },
      { nome: 'João Costa', email: 'consultoria2@discricionario.local', perfil: PerfilUsuario.CONSULTORIA },
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

  private async criarCiclo(manager: EntityManager, ano: number, ativo: boolean): Promise<Ciclo> {
    const existente = await manager.findOne(Ciclo, { where: { ano } });
    if (existente) {
      existente.ativo = ativo;
      existente.status = ativo ? StatusCiclo.ABERTO : StatusCiclo.FECHADO;
      return manager.save(existente);
    }

    return manager.save(
      manager.create(Ciclo, {
        ano,
        descricao: `Ciclo ${ano}`,
        status: ativo ? StatusCiclo.ABERTO : StatusCiclo.FECHADO,
        ativo,
        fechadoEm: ativo ? null : new Date(ano + 1, 2, 31),
      }),
    );
  }

  /** Pessoas estáveis entre os ciclos — mesma matrícula, mesmo nome. */
  private gerarPessoas(gerador: Gerador, quantidade: number) {
    return Array.from({ length: quantidade }, (_, indice) => {
      const nivel = gerador.item(NIVEIS_CARGO);
      const grupo = gerador.item(GRUPOS_RANKING);

      return {
        emplid: String(80000000 + indice),
        nationalId: String(10000000000 + indice),
        nome: `${gerador.item(PRIMEIROS_NOMES)} ${gerador.item(SOBRENOMES)} ${gerador.item(SOBRENOMES)}`,
        nivel: nivel.nivel,
        managerLevel: nivel.managerLevel,
        pesoBase: nivel.pesoBase,
        cargo: gerador.item(CARGOS),
        area: grupo.area,
        grupo,
        modeloAvaliacao: gerador.proximo() < 0.75 ? MODELOS_AVALIACAO[0] : MODELOS_AVALIACAO[1],
        // ~18% mudaram de área e terão linha na base de acréscimo.
        areaOrigem: gerador.proximo() < 0.18 ? gerador.item(AREAS) : null,
        socio: gerador.proximo() < 0.08,
        valorBaseAnual: Math.round(nivel.pesoBase * gerador.inteiro(90_000, 170_000)),
      };
    });
  }

  private async criarParticipantes(
    manager: EntityManager,
    ciclo: Ciclo,
    pessoas: ReturnType<SeedService['gerarPessoas']>,
    ano: number,
  ): Promise<Participante[]> {
    const gerador = criarGerador(ano * 13);
    const registros: Array<Partial<Participante>> = [];

    for (const pessoa of pessoas) {
      // O valor base cresce ~5% por ano, para os comparativos fazerem sentido.
      const fatorAno = 1 + (ano - 2025) * 0.05;
      const valorBase = Math.round(pessoa.valorBaseAnual * fatorAno);
      const fpi = gerador.decimal(0.85, 1.3, 4);
      const fpba = gerador.decimal(0.9, 1.1, 4);

      // CALC4 é a BASE do PR (VB × FPBA). O PR sai de CALC4 × FPI.
      const calc4 = paraMoeda(valorBase * fpba);
      const calculo = this.calculoService.calcularParticipante({
        fpi,
        fd: 0,
        calc4,
        ...CURVA_PADRAO,
      });

      const prAnterior = paraMoeda(calculo.vlPrI / fatorAno / 1.05);
      const totalCash = paraMoeda(valorBase * 1.3 + calculo.vlPrI);

      registros.push({
        cicloId: ciclo.id,
        emplid: pessoa.emplid,
        nationalId: pessoa.nationalId,
        nome: pessoa.nome,
        company: '0001',
        descrCompany: 'Instituição Fictícia S.A.',
        jobcode: `JC${pessoa.managerLevel}`,
        descrJobcode: pessoa.cargo,
        managerLevel: pessoa.managerLevel,
        xlatlongname: pessoa.nivel,
        deptid: `DP${pessoa.grupo.codigo}`,
        descrDeptid: pessoa.grupo.nome,
        area: pessoa.area,
        areaOrigem: pessoa.areaOrigem,
        idsubmodelo: 'SM01',
        descricaoSubmodelo: `Submodelo ${pessoa.modeloAvaliacao}`,
        valorBase,
        vlBaseMes: paraMoeda(valorBase / 12),
        elegivel: 1,
        elegTotal: 1,
        fpba,
        nota: gerador.decimal(1.5, 4, 2),
        fpi,
        fd: 0,
        calc1: paraMoeda(valorBase * fpba),
        calc2: paraMoeda(valorBase * fpi),
        calc3: paraMoeda(valorBase),
        calc4,
        grupoRanking: `${pessoa.grupo.codigo} - ${pessoa.grupo.nome}`,
        idpool: 'Dentro de Pool',
        idcurva: 'CURVA_PADRAO',
        vbAnoAnterior: paraMoeda(valorBase / 1.05),
        prAnoAnterior1: prAnterior,
        prAnoAnterior2: paraMoeda(prAnterior * 0.95),
        prAnoAnterior3: paraMoeda(prAnterior * 0.9),
        totalCash,
        totalCashAnoAnterior1: paraMoeda(totalCash * 0.95),
        totalCashAnoAnterior2: paraMoeda(totalCash * 0.9),
        totalCashAnoAnterior3: paraMoeda(totalCash * 0.85),
        vlPrI: calculo.vlPrI,
        vlPrF: calculo.vlPrF,
        // VLR_TEORICO da área atual — base do pool.
        vlrTeorico: paraMoeda(calculo.vlPrI * gerador.decimal(0.95, 1.12, 4)),
        notaAnoAnterior: gerador.decimal(1.5, 4, 2),
        modeloAvaliacao: pessoa.modeloAvaliacao,
        flagComunidade: pessoa.modeloAvaliacao === 'Comunidade' ? 'S' : 'N',
        areaGrupo: pessoa.grupo.codigo,
        nomeGrupo: pessoa.grupo.nome,
        statusContrato: 'Contratado',
        socioAnoAnterior: pessoa.socio,
        socioAno: pessoa.socio,
        ...CURVA_PADRAO,
      });
    }

    const salvos: Participante[] = [];
    for (let i = 0; i < registros.length; i += 500) {
      salvos.push(
        ...(await manager.save(Participante, registros.slice(i, i + 500) as Participante[])),
      );
    }

    this.logger.log(`Ciclo ${ciclo.ano}: ${salvos.length} participantes.`);
    return salvos;
  }

  private async criarAcrescimos(
    manager: EntityManager,
    ciclo: Ciclo,
    participantes: Participante[],
    gerador: Gerador,
  ): Promise<void> {
    const transferidos = participantes.filter((participante) => participante.areaOrigem);

    const registros = transferidos.map((participante) => {
      const proporcao = gerador.decimal(0.08, 0.35, 4);
      // O acréscimo carrega uma fatia da base (CALC4) e o mesmo FPI do titular:
      // o VL_PR_I do acréscimo é CALC4 × FPI, igual ao do titular.
      const calc4 = paraMoeda(Number(participante.calc4) * proporcao);
      const fpi = Number(participante.fpi);

      return {
        cicloId: ciclo.id,
        participanteId: participante.id,
        emplid: participante.emplid,
        // ~85% elegíveis; o restante existe para exercitar a regra de exclusão.
        flagCalcularPool: gerador.proximo() < 0.85,
        tipoSimulador: 'Institucional',
        idpool: 'Dentro de Pool',
        grupoRanking: null,
        area: participante.areaOrigem,
        vlrTeorico: paraMoeda(Number(participante.vlrTeorico) * proporcao),
        vlPrI: this.calculoService.calcularVlPrI(calc4, fpi),
        calc4,
        fpi,
      };
    });

    for (let i = 0; i < registros.length; i += 500) {
      await manager.insert(Acrescimo, registros.slice(i, i + 500));
    }

    this.logger.log(`Ciclo ${ciclo.ano}: ${registros.length} acréscimos.`);
  }

  private async criarComites(
    manager: EntityManager,
    ciclo: Ciclo,
    usuarios: Usuario[],
    participantes: Participante[],
  ): Promise<Comite[]> {
    const [admin, atendimento1, atendimento2, consultoria1, consultoria2] = usuarios;
    const comites: Comite[] = [];

    for (const grupo of GRUPOS_RANKING) {
      const grupoRanking = `${grupo.codigo} - ${grupo.nome}`;
      const doGrupo = participantes.filter(
        (participante) => participante.grupoRanking === grupoRanking,
      );
      if (!doGrupo.length) continue;

      const temInstitucional = doGrupo.some((p) => p.modeloAvaliacao === 'Institucional');
      const temComunidade = doGrupo.some((p) => p.modeloAvaliacao === 'Comunidade');

      const comite = await manager.save(
        manager.create(Comite, {
          cicloId: ciclo.id,
          codigo: grupo.codigo,
          nome: grupo.nome,
          grupoRanking,
          area: grupo.area,
          tipo:
            temInstitucional && temComunidade
              ? TipoComite.MISTO
              : temComunidade
                ? TipoComite.COMUNIDADE
                : TipoComite.INSTITUCIONAL,
          status: StatusComite.EM_ANDAMENTO,
          descricao: `Comitê fictício de ${grupo.nome} — ciclo ${ciclo.ano}`,
          criadoPorId: atendimento1.id,
        }),
      );

      await manager.insert(ComiteResponsavel, [
        { comiteId: comite.id, usuarioId: consultoria1.id, papel: PapelResponsavel.CONSULTORIA },
        { comiteId: comite.id, usuarioId: consultoria2.id, papel: PapelResponsavel.CONSULTORIA },
        { comiteId: comite.id, usuarioId: atendimento2.id, papel: PapelResponsavel.BACKUP },
        { comiteId: comite.id, usuarioId: atendimento1.id, papel: PapelResponsavel.CRIADOR },
        { comiteId: comite.id, usuarioId: admin.id, papel: PapelResponsavel.BACKUP },
      ]);

      await manager.update(
        Participante,
        { cicloId: ciclo.id, grupoRanking },
        { comiteId: comite.id },
      );

      comites.push(comite);
    }

    this.logger.log(`Ciclo ${ciclo.ano}: ${comites.length} comitês.`);
    return comites;
  }

  /**
   * Lança discricionários respeitando pool e limite de 1/3 do HC por
   * nível/modelo — a massa nunca nasce em estado inválido.
   */
  private async lancarDiscricionarios(
    manager: EntityManager,
    ciclo: Ciclo,
    comites: Comite[],
    usuario: Usuario,
    gerador: Gerador,
  ): Promise<void> {
    const motivos = await manager.find(Motivo, { order: { ordem: 'ASC' } });
    let total = 0;

    for (const comite of comites) {
      const participantes = await manager.find(Participante, {
        where: { comiteId: comite.id },
        relations: { acrescimos: true },
      });

      const vlrTeorico = participantes.reduce((acumulado, participante) => {
        const elegiveis = (participante.acrescimos ?? []).filter((a) => a.elegivel);
        return (
          acumulado +
          Number(participante.vlrTeorico) +
          elegiveis.reduce((t, a) => t + Number(a.vlrTeorico), 0)
        );
      }, 0);

      const poolDisponivel = this.calculoService.calcularPoolDisponivel(
        vlrTeorico,
        Number(ciclo.percentualPool),
      );

      // Cota de 1/3 do HC por nível + modelo (seção 3.3).
      const cotas = new Map<string, number>();
      for (const participante of participantes) {
        const chave = `${participante.xlatlongname}|${participante.modeloAvaliacao}`;
        cotas.set(chave, (cotas.get(chave) ?? 0) + 1);
      }
      const restante = new Map(
        [...cotas.entries()].map(([chave, hc]) => [
          chave,
          this.calculoService.calcularHcMaximo(hc, Number(ciclo.divisorHcMax)),
        ]),
      );

      let consumido = 0;

      for (const participante of participantes) {
        const chave = `${participante.xlatlongname}|${participante.modeloAvaliacao}`;
        if ((restante.get(chave) ?? 0) <= 0) continue;
        if (gerador.proximo() > 0.5) continue;

        const motivo = gerador.item(motivos);
        const limite = motivo.limiteFd ?? Number(ciclo.limiteFd);
        const positivo = gerador.proximo() < 0.6;
        const fd = Number((gerador.decimal(0.005, limite, 4) * (positivo ? 1 : -1)).toFixed(4));

        const elegiveis = (participante.acrescimos ?? []).filter((a) => a.elegivel);
        const calculo = this.calculoService.calcularParticipante(
          { ...participante, fd },
          elegiveis,
          {
            percentualPool: Number(ciclo.percentualPool),
            limiteFd: Number(ciclo.limiteFd),
            divisorHcMax: Number(ciclo.divisorHcMax),
            fatorPep: Number(ciclo.fatorPep),
            fatorDiferimento: Number(ciclo.fatorDiferimento),
          },
        );

        // Não estoura o pool: o lançamento positivo só entra se couber.
        if (consumido + calculo.diferencaDiscricionario > poolDisponivel) continue;
        consumido = paraMoeda(consumido + calculo.diferencaDiscricionario);

        await manager.update(
          Participante,
          { id: participante.id },
          {
            fd: calculo.fd,
            vlPrF: calculo.vlPrF,
            notaDiscricionario: calculo.notaPosDiscricionario,
            motivoId: motivo.id,
            codMotivador: motivo.codigo,
            motivoDiscricionario: motivo.descricao,
            observacaoPoscomite: positivo
              ? 'Reconhecimento de entregas acima do esperado no ciclo (dado fictício).'
              : 'Ajuste de posicionamento frente ao grupo comparativo (dado fictício).',
            lancadoPorId: usuario.id,
            lancadoEm: new Date(),
          },
        );

        restante.set(chave, (restante.get(chave) ?? 0) - 1);
        total += 1;
      }

      this.logger.log(
        `  ${comite.grupoRanking} (${ciclo.ano}): pool R$ ${poolDisponivel.toFixed(2)} | ` +
          `consumido R$ ${consumido.toFixed(2)}`,
      );
    }

    this.logger.log(`Ciclo ${ciclo.ano}: ${total} discricionários lançados.`);
  }

  /** No ciclo histórico os comitês já nascem concluídos, com ATA completa. */
  private async criarAtas(
    manager: EntityManager,
    ciclo: Ciclo,
    comites: Comite[],
    usuarios: Usuario[],
    cicloAtivo: boolean,
  ): Promise<void> {
    const [admin, atendimento1, , consultoria1, consultoria2] = usuarios;

    for (const [indice, comite] of comites.entries()) {
      // No ciclo ativo, o último comitê fica sem ATA para exercitar o alerta.
      if (cicloAtivo && indice === comites.length - 1) continue;

      const ata = await manager.save(
        manager.create(Ata, {
          comiteId: comite.id,
          data: `${ciclo.ano}-03-${String(10 + indice).padStart(2, '0')}`,
          horaInicio: '14:00',
          horaFim: '15:30',
          observacoes: 'Ata fictícia gerada pelo seed de desenvolvimento.',
        }),
      );

      await manager.insert(AtaParticipante, [
        { ataId: ata.id, nome: consultoria1.nome, papel: 'Consultoria responsável', usuarioId: consultoria1.id },
        { ataId: ata.id, nome: consultoria2.nome, papel: 'Consultoria responsável', usuarioId: consultoria2.id },
        { ataId: ata.id, nome: atendimento1.nome, papel: 'Atendimento', usuarioId: atendimento1.id },
      ]);

      // Ciclo histórico: comitês fechados, como ficariam ao fim do ano.
      if (!cicloAtivo) {
        await manager.update(
          Comite,
          { id: comite.id },
          {
            status: StatusComite.CONCLUIDO,
            concluidoEm: new Date(ciclo.ano, 2, 20),
            concluidoPorId: admin.id,
          },
        );
      }
    }
  }
}
