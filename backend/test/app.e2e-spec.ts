import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExcecaoFilter } from '../src/common/filters';
import { PerfilUsuario } from '../src/common/enums';
import { Usuario } from '../src/usuarios/entities/usuario.entity';
import { UsuariosService } from '../src/usuarios/usuarios.service';

const SENHA = 'Senha@123';
const EMAIL_ADMIN = 'e2e-admin@discricionario.local';

/** Base principal mínima usada nos cenários. */
const CSV_BASE_PRINCIPAL = [
  'FUNCIONAL;NOME;CARGO;NIVEL_CARGO;MODELO_AVALIACAO;AREA;FPI;FBPA;VALORBASE;VLRTEORICO',
  'E2E001;Ana Teste Almeida;Analista;Júnior;Corporativo;Tecnologia;1,00;1,00;10000;120000',
  'E2E002;Bruno Teste Barbosa;Analista;Pleno;Corporativo;Tecnologia;1,10;1,00;12000;150000',
  'E2E003;Carla Teste Cardoso;Especialista;Sênior;Comercial;Tecnologia;1,20;1,00;15000;200000',
  'E2E004;VALOR INVALIDO;Analista;Pleno;Corporativo;Tecnologia;XPTO;1,00;9000;100000',
].join('\n');

const CSV_BASE_ACRESCIMO = [
  'FUNCIONAL;AREA_ORIGEM;ACRESCIMO_PR_I;ACRESCIMO_PR_F;OBSERVACAO',
  'E2E002;Comercial;1.000,00;1.200,00;Passou por outra área',
].join('\n');

describe('API Discricionário de Remuneração (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  const http = () => request(app.getHttpServer());
  const autenticado = (metodo: 'get' | 'post' | 'put' | 'delete', url: string) =>
    http()[metodo](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExcecaoFilter());
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());

    // Usuário administrador do cenário.
    const usuarios = dataSource.getRepository(Usuario);
    const existente = await usuarios.findOne({ where: { email: EMAIL_ADMIN } });
    if (!existente) {
      await usuarios.save(
        usuarios.create({
          nome: 'Administrador E2E',
          email: EMAIL_ADMIN,
          senhaHash: await UsuariosService.gerarHash(SENHA),
          perfil: PerfilUsuario.ADMIN,
          ativo: true,
        }),
      );
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  // ------------------------------------------------------------------
  // Autenticação
  // ------------------------------------------------------------------

  describe('Autenticação', () => {
    it('bloqueia rota protegida sem token', async () => {
      await http().get('/api/participantes').expect(401);
    });

    it('rejeita credenciais inválidas com o contrato padrão de erro', async () => {
      const resposta = await http()
        .post('/api/autenticacao/login')
        .send({ email: EMAIL_ADMIN, senha: 'senha-errada' })
        .expect(401);

      expect(resposta.body).toMatchObject({ statusCode: 401, error: 'Unauthorized' });
    });

    it('rejeita payload inválido com mensagens de validação', async () => {
      const resposta = await http()
        .post('/api/autenticacao/login')
        .send({ email: 'nao-e-email', senha: '1' })
        .expect(400);

      expect(resposta.body.statusCode).toBe(400);
      expect(Array.isArray(resposta.body.message)).toBe(true);
    });

    it('autentica e devolve o token', async () => {
      const resposta = await http()
        .post('/api/autenticacao/login')
        .send({ email: EMAIL_ADMIN, senha: SENHA })
        .expect(200);

      expect(resposta.body.usuario.perfil).toBe(PerfilUsuario.ADMIN);
      expect(resposta.body.accessToken).toBeDefined();
      token = resposta.body.accessToken;
    });
  });

  // ------------------------------------------------------------------
  // Upload das bases
  // ------------------------------------------------------------------

  describe('POST /importacoes', () => {
    it('recusa arquivo sem as colunas obrigatórias', async () => {
      const resposta = await autenticado('post', '/api/importacoes')
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETO')
        .attach('file', Buffer.from('NOME;CARGO\nAna;Analista'), 'invalido.csv')
        .expect(400);

      expect(resposta.body.codigo).toBe('UPLOAD_INVALIDO');
      expect(resposta.body.message).toMatch(/FUNCIONAL/);
    });

    it('processa a base principal em modo COMPLETO e reporta os registros inválidos', async () => {
      const resposta = await autenticado('post', '/api/importacoes')
        .field('tipoBase', 'PRINCIPAL')
        .field('modo', 'COMPLETO')
        .attach('file', Buffer.from(CSV_BASE_PRINCIPAL), 'base-principal.csv')
        .expect(201);

      expect(resposta.body.totalRegistros).toBe(4);
      expect(resposta.body.registrosProcessados).toBe(3);
      expect(resposta.body.registrosComErro).toBe(1);
      expect(resposta.body.erros[0]).toMatchObject({ coluna: 'FPI' });
      expect(resposta.body.status).toBe('CONCLUIDO_COM_ERROS');
    });

    it('processa a base de acréscimo', async () => {
      const resposta = await autenticado('post', '/api/importacoes')
        .field('tipoBase', 'ACRESCIMO')
        .field('modo', 'COMPLETO')
        .attach('file', Buffer.from(CSV_BASE_ACRESCIMO), 'base-acrescimo.csv')
        .expect(201);

      expect(resposta.body.registrosInseridos).toBe(1);
      expect(resposta.body.registrosComErro).toBe(0);
    });

    it('registra a importação no histórico e na auditoria', async () => {
      const uploads = await autenticado('get', '/api/importacoes?limit=10').expect(200);
      expect(uploads.body.total).toBeGreaterThanOrEqual(2);

      const auditoria = await autenticado('get', '/api/logs-auditoria?acao=UPLOAD_CONCLUIDO').expect(200);
      expect(auditoria.body.total).toBeGreaterThanOrEqual(2);
    });
  });

  // ------------------------------------------------------------------
  // Participantes
  // ------------------------------------------------------------------

  describe('GET /participantes', () => {
    it('devolve o envelope paginado', async () => {
      const resposta = await autenticado('get', '/api/participantes?page=1&limit=2').expect(200);

      expect(resposta.body).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(resposta.body.data).toHaveLength(2);
    });

    it('busca por nome e por matrícula', async () => {
      const porNome = await autenticado('get', '/api/participantes?search=Bruno').expect(200);
      expect(porNome.body.total).toBe(1);

      const porFuncional = await autenticado('get', '/api/participantes?search=E2E003').expect(200);
      expect(porFuncional.body.total).toBe(1);
    });

    it('filtra por nível de cargo', async () => {
      const resposta = await autenticado('get', '/api/participantes?nivelCargo=Pleno').expect(200);
      expect(resposta.body.total).toBe(1);
    });

    it('calcula VL_PR_I e VL_PR_F a partir das fórmulas oficiais', async () => {
      const lista = await autenticado('get', '/api/participantes?search=E2E001').expect(200);
      const participante = lista.body.data[0];

      // 10.000 x 1,00 x 1,00 = 10.000
      expect(participante.valorPrI).toBe(10000);
      expect(participante.valorPrF).toBe(10000);
    });

    it('soma os acréscimos apenas na visão anual', async () => {
      const lista = await autenticado('get', '/api/participantes?search=E2E002').expect(200);
      const detalhe = await autenticado('get', `/api/participantes/${lista.body.data[0].id}`).expect(200);

      // Base: 12.000 x 1,00 x 1,10 = 13.200 | acréscimo PR_I = 1.000
      expect(detalhe.body.valorPrI).toBe(13200);
      expect(detalhe.body.valorPrIAnual).toBe(14200);
      expect(detalhe.body.valorPrFAnual).toBe(14400);
      expect(detalhe.body.acrescimos).toHaveLength(1);
    });

    it('rejeita campo de ordenação desconhecido', async () => {
      await autenticado('get', '/api/participantes?sortBy=coluna_inexistente').expect(400);
    });
  });

  // ------------------------------------------------------------------
  // Grupos, comitês e discricionário
  // ------------------------------------------------------------------

  describe('Fluxo grupo -> comitê -> discricionário', () => {
    let grupoId: string;
    let comiteId: string;
    let analiseId: string;

    it('cria o grupo com os participantes selecionados', async () => {
      const participantes = await autenticado('get', '/api/participantes?limit=100').expect(200);
      const ids = participantes.body.data.map((p: { id: string }) => p.id);

      const resposta = await autenticado('post', '/api/grupos')
        .send({ nome: 'Grupo E2E', codigo: 'GRP-E2E', participanteIds: ids })
        .expect(201);

      grupoId = resposta.body.id;
      expect(resposta.body.totalParticipantes).toBe(3);
    });

    it('recusa código de grupo duplicado', async () => {
      await autenticado('post', '/api/grupos')
        .send({ nome: 'Outro', codigo: 'GRP-E2E' })
        .expect(409);
    });

    it('calcula o pool do grupo como 1% do VLRTEORICO total', async () => {
      const resposta = await autenticado('get', `/api/grupos/${grupoId}/pool`).expect(200);

      // 120.000 + 150.000 + 200.000 = 470.000 -> pool = 4.700
      expect(resposta.body.vlrTeoricoTotal).toBe(470000);
      expect(resposta.body.poolTotal).toBe(4700);
    });

    it('cria o comitê e monta a navegação', async () => {
      const resposta = await autenticado('post', '/api/comites')
        .send({ nome: 'Comitê E2E', codigo: 'COM-E2E', grupoId })
        .expect(201);

      comiteId = resposta.body.id;
      expect(resposta.body.totalParticipantes).toBe(3);
    });

    it('lista os participantes do comitê em ordem de navegação', async () => {
      const resposta = await autenticado('get', `/api/comites/${comiteId}/participantes`).expect(200);

      expect(resposta.body.total).toBe(3);
      expect(resposta.body.data.map((linha: { ordem: number }) => linha.ordem)).toEqual([1, 2, 3]);
      analiseId = resposta.body.data[0].analiseId;
    });

    it('navega para o primeiro, próximo e último participante', async () => {
      const primeiro = await autenticado('get', `/api/comites/${comiteId}/navegacao?direcao=primeiro`).expect(200);
      expect(primeiro.body.ordem).toBe(1);

      const proximo = await autenticado(
        'get',
        `/api/comites/${comiteId}/navegacao?direcao=proximo&analiseId=${primeiro.body.analiseId}`,
      ).expect(200);
      expect(proximo.body.ordem).toBe(2);

      const ultimo = await autenticado('get', `/api/comites/${comiteId}/navegacao?direcao=ultimo`).expect(200);
      expect(ultimo.body.ordem).toBe(3);
      expect(ultimo.body.proximaAnaliseId).toBeNull();
    });

    it('rejeita discricionário acima do limite de +15pp', async () => {
      const resposta = await autenticado('post', '/api/discricionarios')
        .send({ analiseId, valorFd: 0.2 })
        .expect(400);

      expect(JSON.stringify(resposta.body.message)).toMatch(/discricion/i);
    });

    it('lança o discricionário e devolve pool e resumo atualizados', async () => {
      const resposta = await autenticado('post', '/api/discricionarios')
        .send({
          analiseId,
          valorFd: 0.1,
          avaliacaoComportamentalCodigo: 'PERFORMANCE',
          justificativa: 'Entregas acima do esperado',
          avancarParaProximo: true,
        })
        .expect(201);

      // Participante E2E001: 10.000 x 1,00 x (1,00 + 0,10) = 11.000 -> impacto 1.000
      expect(resposta.body.discricionario.fpiFinalCalculado).toBe(1.1);
      expect(resposta.body.discricionario.valorPrFCalculado).toBe(11000);
      expect(resposta.body.discricionario.impactoFinanceiro).toBe(1000);
      expect(resposta.body.pool.poolUtilizado).toBe(1000);
      expect(resposta.body.pool.poolDisponivel).toBe(3700);
      expect(resposta.body.resumoPorNivelCargo.length).toBeGreaterThan(0);
      expect(resposta.body.proximaAnalise.ordem).toBe(2);
    });

    it('bloqueia lançamento que ultrapassa o pool disponível', async () => {
      const participantes = await autenticado('get', `/api/comites/${comiteId}/participantes`).expect(200);
      const outra = participantes.body.data.find((linha: { ordem: number }) => linha.ordem === 3);

      // Carla: 15.000 x 1,00 x 0,15 = 2.250 de impacto — cabe.
      // Duas tentativas seguidas de 15pp estourariam o pool restante de 3.700.
      await autenticado('post', '/api/discricionarios')
        .send({ analiseId: outra.analiseId, valorFd: 0.15 })
        .expect(201);

      const segunda = participantes.body.data.find((linha: { ordem: number }) => linha.ordem === 2);
      const resposta = await autenticado('post', '/api/discricionarios')
        .send({ analiseId: segunda.analiseId, valorFd: 0.15 })
        .expect(422);

      expect(resposta.body.codigo).toBe('POOL_EXCEDIDO');
    });

    it('consolida o resumo por nível de cargo', async () => {
      const resposta = await autenticado('get', `/api/comites/${comiteId}/resumo`).expect(200);

      expect(resposta.body.totalParticipantes).toBe(3);
      expect(resposta.body.participantesAnalisados).toBe(2);
      expect(resposta.body.participantesPendentes).toBe(1);
      expect(resposta.body.pool.poolTotal).toBe(4700);

      const niveis = resposta.body.porNivelCargo.map((linha: { chave: string }) => linha.chave);
      expect(niveis).toEqual(expect.arrayContaining(['Júnior', 'Pleno', 'Sênior']));
    });

    it('registra a auditoria do lançamento com valor anterior e novo', async () => {
      const resposta = await autenticado(
        'get',
        `/api/logs-auditoria?comiteId=${comiteId}&acao=DISCRICIONARIO_CRIADO`,
      ).expect(200);

      expect(resposta.body.total).toBeGreaterThanOrEqual(2);
      expect(resposta.body.data[0]).toMatchObject({ campoAlterado: 'valorFd', entidade: 'DISCRICIONARIO' });
    });

    it('impede finalizar o comitê com análises pendentes', async () => {
      const resposta = await autenticado('post', `/api/comites/${comiteId}/finalizar`).expect(422);
      expect(resposta.body.codigo).toBe('COMITE_COM_PENDENCIAS');
    });

    it('impede excluir grupo com comitê vinculado', async () => {
      const resposta = await autenticado('delete', `/api/grupos/${grupoId}`).expect(422);
      expect(resposta.body.codigo).toBe('GRUPO_COM_COMITES');
    });
  });

  // ------------------------------------------------------------------
  // Dashboard e auditoria do frontend
  // ------------------------------------------------------------------

  describe('Dashboard e auditoria', () => {
    it('devolve o resumo da página inicial', async () => {
      const resposta = await autenticado('get', '/api/painel').expect(200);

      expect(resposta.body.participantes).toBe(3);
      expect(resposta.body.grupos).toBeGreaterThanOrEqual(1);
      expect(resposta.body.comites).toBeGreaterThanOrEqual(1);
      expect(resposta.body.pool.poolTotal).toBeGreaterThan(0);
    });

    it('devolve as séries dos gráficos', async () => {
      const resposta = await autenticado('get', '/api/painel/graficos').expect(200);

      expect(Array.isArray(resposta.body.porNivelCargo)).toBe(true);
      expect(Array.isArray(resposta.body.porStatusAnalise)).toBe(true);
    });

    it('aceita registros de auditoria vindos do frontend', async () => {
      await autenticado('post', '/api/logs-auditoria')
        .send({ action: 'UPDATE_DISCRETIONARY', entity: 'PARTICIPANT', entityId: 'abc', details: { de: 1 } })
        .expect(201);

      const resposta = await autenticado('get', '/api/logs-auditoria?origem=FRONTEND').expect(200);
      expect(resposta.body.total).toBeGreaterThanOrEqual(1);
    });

    it('devolve 404 no contrato padrão para recurso inexistente', async () => {
      const resposta = await autenticado(
        'get',
        '/api/grupos/00000000-0000-4000-8000-000000000000',
      ).expect(404);

      expect(resposta.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    });
  });
});
