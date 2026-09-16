import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PerfilUsuario } from '../src/common/enums';
import { HttpExcecaoFilter } from '../src/common/filters';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';

const API = '/api/v1';
const SENHA = 'Senha@123';
const EMAIL_ADMIN = 'e2e-admin@discricionario.local';
const EMAIL_CONSULTORIA = 'e2e-consultoria@discricionario.local';

/**
 * Base principal mínima. O CALC4 é a BASE do PR (VL_PR_I = CALC4 × FPI), então
 * aqui ele é o próprio VALORBASE e o PR acompanha o FPI de forma previsível.
 */
const CABECALHO =
  'EMPLID;NAME;XLATLONGNAME;MODELO_AVALIACAO;AREA;FPI;CALC4;VALORBASE;VLBASEMES;VLR_TEORICO;GRUPO_RANKING;TOTAL_CASH;TOTAL_CASH_ANO_ANTERIOR2;PR_ANO_ANTERIOR2';

const linha = (
  emplid: string,
  nome: string,
  nivel: string,
  fpi: number,
  valorBase: number,
  grupo: string,
) =>
  [
    emplid,
    nome,
    nivel,
    'Institucional',
    'Tecnologia',
    String(fpi).replace('.', ','),
    String(valorBase),
    String(valorBase),
    String(valorBase / 12),
    String(valorBase * fpi),
    grupo,
    String(valorBase * 2),
    String(valorBase * 1.9),
    String(valorBase * fpi * 0.95),
  ].join(';');

const GRUPO = '100702 - WMS PRIVATE';

const csvCiclo = (prefixo: string) =>
  [
    CABECALHO,
    linha(`${prefixo}01`, 'Ana Teste Almeida', 'Coordenador', 1, 100_000, GRUPO),
    linha(`${prefixo}02`, 'Bruno Teste Barbosa', 'Coordenador', 1, 100_000, GRUPO),
    linha(`${prefixo}03`, 'Carla Teste Cardoso', 'Gerente', 1, 200_000, GRUPO),
    `${prefixo}04;Registro Invalido;Coordenador;Institucional;Tecnologia;XPTO;1;1;1;1;${GRUPO};1;1;1`,
  ].join('\n');

const CSV_ACRESCIMO = [
  'EMPLID;FLAG_CALCULAR_POOL;TIPO_SIMULADOR;IDPOOL;VLR_TEORICO;VL_PR_I;CALC4;FPI',
  'A2601;Sim;Institucional;Dentro de Pool;20000;20000;20000;1',
  'A2602;Não;Institucional;Dentro de Pool;50000;50000;50000;1',
].join('\n');

describe('API Discricionário de Remuneração (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let tokenConsultoria: string;

  const http = () => request(app.getHttpServer());
  const como = (autorizacao: string, metodo: 'get' | 'post' | 'put' | 'delete' | 'patch', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${autorizacao}`);
  const admin = (metodo: 'get' | 'post' | 'put' | 'delete' | 'patch', url: string) =>
    como(token, metodo, url);

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExcecaoFilter());
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    const usuarios = dataSource.getRepository(Usuario);

    for (const [email, nome, perfil] of [
      [EMAIL_ADMIN, 'Administrador E2E', PerfilUsuario.ADMIN],
      [EMAIL_CONSULTORIA, 'Consultoria E2E', PerfilUsuario.CONSULTORIA],
    ] as const) {
      if (!(await usuarios.findOne({ where: { email } }))) {
        await usuarios.save(
          usuarios.create({
            nome,
            email,
            perfil,
            ativo: true,
            senhaHash: await UsuariosService.gerarHash(SENHA),
          }),
        );
      }
    }

    token = (
      await http().post(`${API}/auth/login`).send({ email: EMAIL_ADMIN, senha: SENHA }).expect(200)
    ).body.accessToken;

    tokenConsultoria = (
      await http()
        .post(`${API}/auth/login`)
        .send({ email: EMAIL_CONSULTORIA, senha: SENHA })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  // ------------------------------------------------------------------
  // Ciclos — o coração do histórico
  // ------------------------------------------------------------------

  describe('Ciclos', () => {
    it('exige autenticação', async () => {
      await http().get(`${API}/ciclos`).expect(401);
    });

    it('cria e ativa os ciclos 2025 e 2026', async () => {
      for (const ano of [2025, 2026]) {
        const existente = await admin('get', `${API}/ciclos?limit=100`).expect(200);
        const ja = existente.body.data.find((ciclo: { ano: number }) => ciclo.ano === ano);
        if (!ja) {
          await admin('post', `${API}/ciclos`).send({ ano, ativar: true }).expect(201);
        }
      }

      const lista = await admin('get', `${API}/ciclos?limit=100`).expect(200);
      const anos = lista.body.data.map((ciclo: { ano: number }) => ciclo.ano);
      expect(anos).toEqual(expect.arrayContaining([2025, 2026]));
    });

    it('mantém apenas um ciclo ativo', async () => {
      const lista = await admin('get', `${API}/ciclos?limit=100`).expect(200);
      const ativos = lista.body.data.filter((ciclo: { ativo: boolean }) => ciclo.ativo);
      expect(ativos).toHaveLength(1);
    });

    it('expõe as premissas vigentes do ciclo ativo', async () => {
      const resposta = await admin('get', `${API}/ciclos/ativo`).expect(200);

      expect(resposta.body).toMatchObject({
        percentualPool: 0.01,
        limiteFd: 0.15,
        divisorHcMax: 3,
        fatorPep: 0.725,
        fatorDiferimento: 0.7,
      });
    });
  });

  // ------------------------------------------------------------------
  // Cargas por ciclo
  // ------------------------------------------------------------------

  describe('Cargas das bases', () => {
    it('pré-visualiza a carga sem gravar nada', async () => {
      const resposta = await admin('post', `${API}/uploads/previa`)
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETA')
        .field('ciclo', '2025')
        .attach('file', Buffer.from(csvCiclo('A25')), 'base.csv')
        .expect(200);

      expect(resposta.body.ciclo).toBe(2025);
      expect(resposta.body.registrosValidos).toBe(3);
      expect(resposta.body.registrosComErro).toBe(1);
      expect(resposta.body.colunasReconhecidas).toEqual(expect.arrayContaining(['EMPLID', 'CALC4']));
    });

    it('recusa arquivo sem as colunas obrigatórias', async () => {
      const resposta = await admin('post', `${API}/uploads`)
        .field('tipoBase', 'PRINCIPAL')
        .field('ciclo', '2025')
        .attach('file', Buffer.from('NAME;AREA\nAna;TI'), 'invalido.csv')
        .expect(400);

      expect(resposta.body.codigo).toBe('UPLOAD_INVALIDO');
      expect(resposta.body.message).toMatch(/EMPLID/);
    });

    it('carrega o ciclo 2025 criando o comitê pelo GRUPO_RANKING', async () => {
      const resposta = await admin('post', `${API}/uploads`)
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETA')
        .field('ciclo', '2025')
        .field('confirmarReinicioDoCiclo', 'true')
        .attach('file', Buffer.from(csvCiclo('A25')), 'base-2025.csv')
        .expect(201);

      expect(resposta.body.ciclo).toBe(2025);
      expect(resposta.body.registrosInseridos).toBe(3);
      expect(resposta.body.registrosComErro).toBe(1);
      expect(resposta.body.resumo.comitesCriados).toBeGreaterThanOrEqual(1);
      expect(resposta.body.resumo.participantesVinculados).toBe(3);
    });

    it('carrega o ciclo 2026 sem tocar em 2025', async () => {
      await admin('post', `${API}/uploads`)
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETA')
        .field('ciclo', '2026')
        .field('confirmarReinicioDoCiclo', 'true')
        .attach('file', Buffer.from(csvCiclo('A26')), 'base-2026.csv')
        .expect(201);

      const de2025 = await admin('get', `${API}/participantes?ciclo=2025`).expect(200);
      const de2026 = await admin('get', `${API}/participantes?ciclo=2026`).expect(200);

      expect(de2025.body.total).toBe(3);
      expect(de2026.body.total).toBe(3);
      expect(de2025.body.data[0].emplid).toMatch(/^A25/);
      expect(de2026.body.data[0].emplid).toMatch(/^A26/);
    });

    it('carrega a base de acréscimo e marca a elegibilidade', async () => {
      const resposta = await admin('post', `${API}/uploads`)
        .field('tipoBase', 'ACRESCIMO')
        .field('ciclo', '2026')
        .attach('file', Buffer.from(CSV_ACRESCIMO), 'acrescimo.csv')
        .expect(201);

      expect(resposta.body.registrosInseridos).toBe(2);
      expect(resposta.body.resumo.elegiveis).toBe(1);
      expect(resposta.body.resumo.naoElegiveis).toBe(1);
    });

    it('o acréscimo elegível entra no PR sem discricionário', async () => {
      const lista = await admin('get', `${API}/participantes?ciclo=2026&emplid=A2601`).expect(200);
      const participante = lista.body.data[0];

      // CALC4 100.000 + acréscimo 20.000
      expect(participante.vlPrI).toBe(100_000);
      expect(participante.prSemDiscricionario).toBe(120_000);
    });

    it('o acréscimo não elegível fica de fora do PR', async () => {
      const lista = await admin('get', `${API}/participantes?ciclo=2026&emplid=A2602`).expect(200);
      expect(lista.body.data[0].prSemDiscricionario).toBe(100_000);
    });

    it('registra as cargas no histórico do ciclo e na auditoria', async () => {
      const uploads = await admin('get', `${API}/uploads?ciclo=2026`).expect(200);
      expect(uploads.body.total).toBeGreaterThanOrEqual(2);

      const auditoria = await admin('get', `${API}/audit?acao=UPLOAD_CONCLUIDO`).expect(200);
      expect(auditoria.body.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ------------------------------------------------------------------
  // Participantes e filtros dinâmicos
  // ------------------------------------------------------------------

  describe('Participantes', () => {
    it('devolve o envelope paginado', async () => {
      const resposta = await admin('get', `${API}/participantes?ciclo=2026&page=1&limit=2`).expect(200);

      expect(resposta.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(resposta.body.data).toHaveLength(2);
    });

    it('busca por nome e por funcional', async () => {
      const porNome = await admin('get', `${API}/participantes?ciclo=2026&search=Bruno`).expect(200);
      expect(porNome.body.total).toBe(1);

      const porFuncional = await admin('get', `${API}/participantes?ciclo=2026&search=A2603`).expect(200);
      expect(porFuncional.body.total).toBe(1);
    });

    it('aceita filtro dinâmico campo:operador:valor', async () => {
      const resposta = await admin(
        'get',
        `${API}/participantes?ciclo=2026&filter=nivelCargo:eq:Gerente`,
      ).expect(200);

      expect(resposta.body.total).toBe(1);
      expect(resposta.body.data[0].xlatlongname).toBe('Gerente');
    });

    it('recusa filtro em campo não permitido', async () => {
      await admin('get', `${API}/participantes?ciclo=2026&filter=senhaHash:eq:x`).expect(400);
    });

    it('recusa operador inválido', async () => {
      await admin('get', `${API}/participantes?ciclo=2026&filter=fd:explode:1`).expect(400);
    });

    it('expõe o catálogo de colunas da tabela customizável', async () => {
      const resposta = await admin('get', `${API}/participantes/colunas`).expect(200);

      expect(resposta.body.total).toBeGreaterThan(30);
      expect(resposta.body.colunas.map((c: { chave: string }) => c.chave)).toEqual(
        expect.arrayContaining(['nome', 'fd', 'prPosDiscricionario', 'tcMaisSociosAtual']),
      );
    });
  });

  // ------------------------------------------------------------------
  // Comitê: discricionário, pool, resumo, colunas e ATA
  // ------------------------------------------------------------------

  describe('Comitê', () => {
    let comiteId: string;
    let participanteId: string;

    it('lista os comitês do ciclo', async () => {
      const resposta = await admin('get', `${API}/comites?ciclo=2026`).expect(200);

      expect(resposta.body.total).toBeGreaterThanOrEqual(1);
      comiteId = resposta.body.data[0].id;
      expect(resposta.body.data[0].grupoRanking).toBe(GRUPO);
    });

    it('a Consultoria não enxerga comitês em que não é responsável', async () => {
      const resposta = await como(tokenConsultoria, 'get', `${API}/comites?ciclo=2026`).expect(200);
      expect(resposta.body.total).toBe(0);
    });

    it('vincula a Consultoria e ela passa a enxergar o comitê', async () => {
      const usuarios = await admin('get', `${API}/usuarios?search=e2e-consultoria`).expect(200);
      const consultoriaId = usuarios.body.data[0].id;

      await admin('put', `${API}/comites/${comiteId}`)
        .send({ consultoriaIds: [consultoriaId] })
        .expect(200);

      const resposta = await como(tokenConsultoria, 'get', `${API}/comites?ciclo=2026`).expect(200);
      expect(resposta.body.total).toBe(1);
    });

    it('o pool do comitê é 1% do Σ VLR_TEORICO, com acréscimos elegíveis', async () => {
      const resposta = await admin('get', `${API}/comites/${comiteId}/pool`).expect(200);

      // 100.000 + 100.000 + 200.000 + acréscimo elegível 20.000 = 420.000
      expect(resposta.body.vlrTeoricoTotal).toBe(420_000);
      expect(resposta.body.poolDisponivel).toBe(4_200);
      expect(resposta.body.poolConsumido).toBe(0);
    });

    it('recusa discricionário acima do limite sem confirmação', async () => {
      const lista = await admin('get', `${API}/comites/${comiteId}/participantes`).expect(200);
      participanteId = lista.body.data.find((p: { emplid: string }) => p.emplid === 'A2601').id;

      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.2, codMotivador: 1, justificativa: 'Teste' })
        .expect(400);

      expect(resposta.body.codigo).toBe('DISCRICIONARIO_INVALIDO');
      expect(resposta.body.detalhes.exigeConfirmacao).toBe(true);
    });

    it('recusa discricionário sem motivador', async () => {
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.02 })
        .expect(422);

      expect(resposta.body.codigo).toBe('MOTIVADOR_OBRIGATORIO');
    });

    it('recusa discricionário sem justificativa', async () => {
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.02, codMotivador: 1 })
        .expect(422);

      expect(resposta.body.codigo).toBe('JUSTIFICATIVA_OBRIGATORIA');
    });

    it('respeita o limite próprio do motivador SQV (±5pp)', async () => {
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.09, codMotivador: 3, justificativa: 'SQV acima do limite' })
        .expect(400);

      expect(resposta.body.detalhes.limiteMaximo).toBe(0.05);
    });

    it('bloqueia lançamento que estoura o pool', async () => {
      // Pool 4.200; FD de 15pp sobre CALC4 100.000 consumiria 15.000.
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.15, codMotivador: 1, justificativa: 'Estouro proposital' })
        .expect(422);

      expect(resposta.body.codigo).toBe('POOL_EXCEDIDO');
      expect(resposta.body.detalhes.poolDisponivel).toBe(4_200);
    });

    it('lança o discricionário e recalcula PR, nota e pool', async () => {
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.02, codMotivador: 1, justificativa: 'Entregas acima do esperado' })
        .expect(200);

      // CALC4 100.000 com FPI 1,00 -> FPI_FINAL 1,02 -> PR 102.000 (+ acréscimo 20.400)
      expect(resposta.body.fpiFinal).toBe(1.02);
      expect(resposta.body.vlPrF).toBe(102_000);
      expect(resposta.body.prPosDiscricionario).toBe(122_400);
      expect(resposta.body.diferencaDiscricionario).toBe(2_400);
      expect(resposta.body.fdPp).toBe('+2pp');

      const pool = await admin('get', `${API}/comites/${comiteId}/pool`).expect(200);
      expect(pool.body.poolConsumido).toBe(2_400);
      expect(pool.body.saldo).toBe(1_800);
    });

    it('o resumo por nível traz HC Máx., Checagem e performance ponderada', async () => {
      const resposta = await admin('get', `${API}/comites/${comiteId}/resumo`).expect(200);

      expect(resposta.body.totalParticipantes).toBe(3);
      expect(resposta.body.analisados).toBe(1);

      const coordenador = resposta.body.porNivelCargo.find(
        (linhaResumo: { nivel: string }) => linhaResumo.nivel === 'Coordenador',
      );
      expect(coordenador.institucional.hcTotal).toBe(2);
      expect(coordenador.institucional.hcMaximo).toBe(1);
      expect(coordenador.institucional.aumento).toBe(1);
      expect(coordenador.institucional.checagem).toBe('OK');
      expect(resposta.body.performancePonderada.depois).toBeGreaterThan(
        resposta.body.performancePonderada.antes,
      );
    });

    it('zerar o discricionário remove motivador e justificativa', async () => {
      const resposta = await admin('delete', `${API}/participantes/${participanteId}/discricionario`)
        .expect(200);

      expect(resposta.body.fd).toBe(0);
      expect(resposta.body.codMotivador).toBeNull();
      expect(resposta.body.observacaoPoscomite).toBeNull();

      // Relança para os testes seguintes de conclusão.
      await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.02, codMotivador: 1, justificativa: 'Entregas acima do esperado' })
        .expect(200);
    });

    it('audita o lançamento com valor anterior e novo', async () => {
      const resposta = await admin(
        'get',
        `${API}/audit?comiteId=${comiteId}&acao=DISCRICIONARIO_LANCADO`,
      ).expect(200);

      expect(resposta.body.total).toBeGreaterThanOrEqual(1);
      expect(resposta.body.data[0]).toMatchObject({ campoAlterado: 'fd', entidade: 'PARTICIPANTE' });
    });

    it('salva o layout de colunas escolhido pelo Atendimento', async () => {
      const resposta = await admin('put', `${API}/comites/${comiteId}/colunas`)
        .send({
          colunas: [
            { chave: 'nome', visivel: true, ordem: 0, fixa: true, largura: 240 },
            { chave: 'fd', visivel: true, ordem: 1, rotulo: 'Discricionário (pp)' },
            { chave: 'prPosDiscricionario', visivel: true, ordem: 2 },
            { chave: 'totalCash', visivel: false, ordem: 3 },
          ],
        })
        .expect(200);

      expect(resposta.body.personalizado).toBe(true);

      const visiveis = resposta.body.colunas.filter((c: { visivel: boolean }) => c.visivel);
      expect(visiveis.map((c: { chave: string }) => c.chave)).toEqual([
        'nome',
        'fd',
        'prPosDiscricionario',
      ]);
      expect(visiveis[1].rotulo).toBe('Discricionário (pp)');
    });

    it('a Consultoria abre o comitê já com o layout montado', async () => {
      const resposta = await como(tokenConsultoria, 'get', `${API}/comites/${comiteId}/colunas`).expect(
        200,
      );

      expect(resposta.body.personalizado).toBe(true);
      expect(resposta.body.colunas.find((c: { chave: string }) => c.chave === 'fd').rotulo).toBe(
        'Discricionário (pp)',
      );
    });

    it('recusa coluna fora do catálogo', async () => {
      await admin('put', `${API}/comites/${comiteId}/colunas`)
        .send({ colunas: [{ chave: 'coluna_inexistente' }] })
        .expect(400);
    });

    it('impede concluir sem ATA completa', async () => {
      const resposta = await admin('patch', `${API}/comites/${comiteId}/concluir`).send({}).expect(422);

      expect(resposta.body.codigo).toBe('COMITE_COM_PENDENCIAS');
      expect(resposta.body.detalhes.bloqueiam.join(' ')).toMatch(/ATA/);
    });

    it('cadastra a ATA e conclui o comitê', async () => {
      await admin('put', `${API}/comites/${comiteId}/ata`)
        .send({
          data: '2026-03-18',
          horaInicio: '14:00',
          horaFim: '15:30',
          observacoes: 'Comitê realizado por videoconferência.',
          participantes: [{ nome: 'Maria Silva', papel: 'Consultoria responsável' }],
        })
        .expect(200);

      const pendencias = await admin('get', `${API}/comites/${comiteId}/pendencias`).expect(200);
      expect(pendencias.body.podeConcluir).toBe(true);

      const concluido = await admin('patch', `${API}/comites/${comiteId}/concluir`).send({}).expect(200);
      expect(concluido.body.status).toBe('CONCLUIDO');
    });

    it('comitê concluído bloqueia alteração do discricionário', async () => {
      const resposta = await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.03, codMotivador: 1, justificativa: 'Nova tentativa' })
        .expect(422);

      expect(resposta.body.codigo).toBe('COMITE_CONCLUIDO');
    });

    it('reabre o comitê e volta a aceitar lançamento', async () => {
      await admin('patch', `${API}/comites/${comiteId}/reabrir`).expect(200);

      await admin('patch', `${API}/participantes/${participanteId}/discricionario`)
        .send({ fd: 0.03, codMotivador: 1, justificativa: 'Ajuste após reabertura' })
        .expect(200);
    });
  });

  // ------------------------------------------------------------------
  // Consolidação, histórico e contrato de erro
  // ------------------------------------------------------------------

  describe('Consolidação e histórico', () => {
    it('a visão geral consolida KPIs e alertas do ciclo', async () => {
      const resposta = await admin('get', `${API}/consolidacao/visao-geral?ciclo=2026`).expect(200);

      expect(resposta.body.ciclo).toBe(2026);
      expect(resposta.body.kpis.participantes).toBe(3);
      expect(resposta.body.kpis.poolDisponivel).toBeGreaterThan(0);
      expect(Array.isArray(resposta.body.alertas)).toBe(true);
    });

    it('o comparativo consolida vários comitês', async () => {
      const resposta = await admin('get', `${API}/consolidacao/comparativo?ciclo=2026`).expect(200);
      expect(resposta.body.consolidado.participantes).toBe(3);
    });

    it('os nominais listam quem recebeu discricionário', async () => {
      const resposta = await admin(
        'get',
        `${API}/consolidacao/discricionarios-nominais?ciclo=2026`,
      ).expect(200);

      expect(resposta.body.total).toBeGreaterThanOrEqual(1);
      expect(resposta.body.itens[0]).toHaveProperty('fdPp');
    });

    it('2025 permanece intacto depois de todo o trabalho em 2026', async () => {
      const resposta = await admin('get', `${API}/consolidacao/visao-geral?ciclo=2025`).expect(200);

      expect(resposta.body.ciclo).toBe(2025);
      expect(resposta.body.kpis.participantes).toBe(3);
      expect(resposta.body.kpis.poolConsumido).toBe(0);
    });

    it('recarregar 2026 do zero não apaga 2025', async () => {
      await admin('post', `${API}/uploads`)
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETA')
        .field('ciclo', '2026')
        .field('confirmarReinicioDoCiclo', 'true')
        .attach('file', Buffer.from(csvCiclo('A26')), 'base-2026-recarga.csv')
        .expect(201);

      const de2025 = await admin('get', `${API}/participantes?ciclo=2025`).expect(200);
      expect(de2025.body.total).toBe(3);
    });

    it('a carga completa exige confirmação quando há trabalho no ciclo', async () => {
      const resposta = await admin('post', `${API}/uploads`)
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETA')
        .field('ciclo', '2026')
        .attach('file', Buffer.from(csvCiclo('A26')), 'base.csv')
        .expect(422);

      expect(resposta.body.codigo).toBe('REINICIO_DE_CICLO_NAO_CONFIRMADO');
    });

    it('a pesquisa funcional mostra a situação do colaborador', async () => {
      const resposta = await admin(
        'get',
        `${API}/participantes/pesquisa?termo=A2601&ciclo=2026`,
      ).expect(200);

      expect(resposta.body[0]).toHaveProperty('situacao');
      expect(resposta.body[0].comite).not.toBeNull();
    });

    it('devolve 404 no contrato padrão para recurso inexistente', async () => {
      const resposta = await admin(
        'get',
        `${API}/comites/00000000-0000-4000-8000-000000000000`,
      ).expect(404);

      expect(resposta.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    });

    it('aceita auditoria vinda do frontend', async () => {
      await admin('post', `${API}/audit`)
        .send({ action: 'UPDATE_DISCRETIONARY', entity: 'PARTICIPANT', entityId: 'abc' })
        .expect(201);

      const resposta = await admin('get', `${API}/audit?origem=FRONTEND`).expect(200);
      expect(resposta.body.total).toBeGreaterThanOrEqual(1);
    });
  });
});
