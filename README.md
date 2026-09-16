# API — Discricionário de Remuneração

API REST dos **Comitês Discricionários da Remuneração Variável**: carga das bases
`TBPR_Simuladores` e `TBPR_Simuladores_Acres`, montagem dos comitês, lançamento do Fator
Discricionário (FD) participante a participante, controle do pool, resumos por nível de cargo e
modelo de avaliação, ATA e trilha de auditoria.

O ambiente sobe inteiro com `docker compose up`: PostgreSQL, backend NestJS e pgAdmin.

> **Histórico por ano.** Todo dado pertence a um **ciclo** (2025, 2026, 2027…). A carga completa
> reinicia **apenas o ciclo alvo** — carregar 2027 não encosta em 2026. Admin e Atendimento
> consultam qualquer ano com `?ciclo=2026` em qualquer endpoint.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Ciclos e histórico por ano](#ciclos-e-histórico-por-ano)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Como executar](#como-executar)
- [Como parar](#como-parar)
- [Acessos](#acessos)
- [Migrations](#migrations)
- [Seed](#seed)
- [Testes](#testes)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Perfis e visibilidade](#perfis-e-visibilidade)
- [Regras de negócio](#regras-de-negócio)
- [Upload das bases](#upload-das-bases)
- [Telas suportadas](#telas-suportadas)
- [Tabela customizável](#tabela-customizável)
- [API](#api)
- [Auditoria](#auditoria)
- [Tratamento de erros](#tratamento-de-erros)
- [Evolução](#evolução)

---

## Arquitetura

```text
discricionario-remuneracao/
├── backend/
│   ├── src/
│   │   ├── ciclos/           # Anos-base, premissas vigentes e seletor de ciclo
│   │   ├── auth/             # JWT, guards, perfis e regra de visibilidade
│   │   ├── usuarios/         # Usuários e perfis
│   │   ├── motivos/          # Catálogo de motivadores (COD_MOTIVADOR)
│   │   ├── participantes/    # TBPR_Simuladores, acréscimos, FD e catálogo de colunas
│   │   ├── comites/          # Comitê (GRUPO_RANKING), ATA, resumo e layout da tabela
│   │   ├── uploads/          # Leitura/validação de CSV e carga das duas bases
│   │   ├── calculo/          # Todas as fórmulas, em um único serviço
│   │   ├── consolidacao/     # Visão geral, comparativo, nominais e controle de grupos
│   │   ├── auditoria/        # Trilha append-only
│   │   ├── database/         # DataSource, migrations e seed
│   │   ├── common/           # Paginação, filtros dinâmicos, erros, enums, utilitários
│   │   └── config/           # Leitura centralizada do ambiente
│   ├── test/                 # Testes de integração (e2e)
│   └── Dockerfile
├── exemplos/                 # CSVs de exemplo das duas bases
├── infra/pgadmin/
├── docker-compose.yml
├── .env.example
└── README.md
```

**Dependências entre módulos** — sempre em uma direção, sem ciclos:

```text
CiclosModule ─┐  (globais)
CalculoModule ┤
AuditoriaModule ┘
                 ConsolidacaoModule ─► ComitesModule ─► ParticipantesModule
                 UploadsModule ──────────────────────► (entidades)
```

**Modelo de dados** (todas as tabelas de dados carregam `ciclo_id`):

| Tabela | Papel |
| ------ | ----- |
| `ciclos` | Ano-base + premissas vigentes (pool, limite do FD, fatores de sócio) |
| `usuarios` | Usuários e perfis (ADMIN / ATENDIMENTO / CONSULTORIA) |
| `participantes` | TBPR_Simuladores + a **decisão do comitê** (FD, motivador, justificativa) |
| `acrescimos` | TBPR_Simuladores_Acres, casada por EMPLID |
| `comites` | O GRUPO_RANKING — "código - nome" |
| `comite_responsaveis` | Consultorias, backups e criador (N por comitê) |
| `comite_colunas` | Layout da tabela de participantes, por comitê |
| `atas` / `ata_participantes` | ATA do comitê com data, horários e presentes |
| `motivos` | Catálogo de motivadores, com limite de FD próprio |
| `importacoes` / `erros_importacao` | Histórico das cargas e registros inválidos |
| `auditoria_logs` | Trilha append-only (INSERT/UPDATE/SOFT_DELETE/RESTORE) |

Duas decisões que seguem a documentação e valem destacar:

- **Grupo e comitê são a mesma entidade.** O `GRUPO_RANKING` da base é o comitê; não existe uma
  tabela de grupos separada.
- **O FD vive no participante**, e não em uma tabela de lançamentos. É o que permite que a carga
  parcial preserve as decisões (`FD`, `NOTA_DISCRICIONARIO`, `MOTIVO_DISCRICIONARIO`,
  `OBSERVACAO_POSCOMITE`, `COD_MOTIVADOR`) enquanto atualiza o resto. O histórico de cada
  alteração fica na auditoria.

---

## Ciclos e histórico por ano

O ciclo é a raiz de tudo. Cada ano guarda **seus próprios** participantes, comitês, ATAs,
lançamentos, cargas e premissas.

```text
Ciclo 2025 (FECHADO)  → participantes · comitês · ATAs · FDs · importações · premissas de 2025
Ciclo 2026 (ATIVO)    → participantes · comitês · ATAs · FDs · importações · premissas de 2026
Ciclo 2027 (a abrir)  → herda as premissas de 2026 ao ser criado
```

- **Um ciclo ativo por vez.** É o padrão de todo endpoint quando `?ciclo` é omitido — garantido
  por um índice único parcial no banco.
- **`?ciclo=2026` em qualquer listagem** devolve o ano pedido. `GET /ciclos/anos` alimenta o
  seletor de ano do frontend.
- **Ciclo FECHADO é somente leitura**: continua consultável, mas recusa carga, criação de comitê e
  lançamento (`CICLO_FECHADO`).
- **A carga completa filtra por `ciclo_id`.** Reiniciar 2027 apaga comitês, ATAs e FDs *de 2027* —
  e só deles. Quando já existe trabalho no ciclo, a operação ainda exige
  `confirmarReinicioDoCiclo: true`, com o impacto discriminado na recusa.
- **As premissas são versionadas por ano.** Mudar o percentual do pool em 2027 não reescreve o
  histórico de 2026: cada ciclo mantém os parâmetros que valiam à época.

Abrindo o ano novo:

```bash
# Cria 2027 herdando as premissas de 2026 e já o torna ativo
curl -X POST http://localhost:3000/api/v1/ciclos \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"ano": 2027, "ativar": true}'

# Fecha 2026 para virar histórico somente leitura
curl -X PATCH http://localhost:3000/api/v1/ciclos/$ID_2026/fechar -H "Authorization: Bearer $TOKEN"
```

---

## Tecnologias

- **NestJS 10** + **TypeScript 5**
- **TypeORM 0.3** com **PostgreSQL 16** (migrations; `synchronize` desligado; soft delete)
- **class-validator** / **class-transformer** nos DTOs
- **decimal.js** em todo cálculo financeiro
- **Passport JWT**, guards de perfil e regra de visibilidade aplicada no banco
- **csv-parse** para as duas bases
- **Swagger** em `/api/v1/docs`
- **Jest** + **Supertest**
- **Docker Compose**: PostgreSQL, backend e pgAdmin

---

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- (Opcional, fora do Docker) Node.js 22+ e PostgreSQL 16

---

## Como executar

```bash
cd discricionario-remuneracao
cp .env.example .env
docker compose up --build
```

O backend aguarda o PostgreSQL ficar saudável e roda as migrations automaticamente. Quando aparecer
`API disponível em http://localhost:3000/api/v1`, popule o banco:

```bash
docker compose exec backend npm run seed
```

### Fora do Docker

```bash
cd backend
npm install
# ajuste DATABASE_HOST=localhost no .env
npm run migration:run
npm run seed
npm run start:dev
```

---

## Como parar

```bash
docker compose down            # para os containers, preserva os dados
docker compose down -v         # para e apaga os volumes (banco zerado)
docker compose restart backend
```

> Ao alterar o `package.json`, recrie o volume de dependências:
> `docker compose down -v && docker compose up --build`.

---

## Acessos

| Serviço | URL | Credenciais |
| ------- | --- | ----------- |
| API | http://localhost:3000/api/v1 | JWT |
| Swagger | http://localhost:3000/api/v1/docs | — |
| pgAdmin | http://localhost:5050 | `admin@discricionario.local` / `admin` |
| PostgreSQL | `localhost:5432` | `postgres` / `postgres` |

### Usuários do seed

| E-mail | Perfil | Senha |
| ------ | ------ | ----- |
| `admin@discricionario.local` | ADMIN | `Senha@123` |
| `atendimento1@discricionario.local` | ATENDIMENTO | `Senha@123` |
| `atendimento2@discricionario.local` | ATENDIMENTO | `Senha@123` |
| `consultoria1@discricionario.local` | CONSULTORIA | `Senha@123` |
| `consultoria2@discricionario.local` | CONSULTORIA | `Senha@123` |

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@discricionario.local","senha":"Senha@123"}'
```

Use o `accessToken` em `Authorization: Bearer <token>` (ou no botão **Authorize** do Swagger).

---

## Migrations

O schema nunca é criado por `synchronize`: só por migration.

```bash
docker compose exec backend npm run migration:run
docker compose exec backend npm run migration:revert
docker compose exec backend npm run migration:generate -- src/database/migrations/NomeDaMigration
docker compose exec backend npm run migration:create src/database/migrations/NomeDaMigration
```

Histórico na tabela `migrations_historico`.

---

## Seed

```bash
docker compose exec backend npm run seed            # 2025 (fechado) + 2026 (ativo)
docker compose exec backend npm run seed:reset      # limpa tudo antes
docker compose exec backend npm run seed:anos       # 2025, 2026 e 2027
docker compose exec backend npm run seed -- --qtd=3000 --anos=2024,2025,2026
```

O seed é **determinístico** e gera **dois ciclos com as mesmas pessoas**, justamente para exercitar
o histórico:

- 5 usuários (um por perfil relevante);
- 1.200 participantes por ciclo, com EMPLID estável entre os anos e VB crescendo ~5% ao ano;
- acréscimos para os ~18% que mudaram de área (parte deles não elegível, de propósito);
- 4 comitês por ciclo com consultorias, backups e criador;
- FDs lançados respeitando **pool** e **1/3 do HC** por nível/modelo;
- ATAs completas; no ciclo ativo, um comitê fica sem ATA para exercitar o alerta;
- o ciclo mais antigo nasce **fechado** e com os comitês **concluídos**.

> ⚠️ **Todos os dados do seed são fictícios.**

---

## Testes

```bash
docker compose exec backend npm test        # unitários
docker compose exec backend npm run test:cov
docker compose exec backend npm run test:e2e
```

**Unitários** — fórmulas (`FPI_FINAL`, `VL_PR_I = CALC4 × FPI`, `VL_PR_F = CALC4 × FPI_FINAL`, PR sem/pós
discricionário com acréscimos, nota interpolada na curva, %RV, %TC, TC + P.Sócios), pool, HC máximo
e checagem "Rever", performance ponderada por VB, validação do FD (limite do ciclo e do motivador),
leitura/validação dos CSVs, resumo por nível × modelo e auditoria.

**Integração (e2e)** — cobre o caminho completo: ciclos, pré-visualização e carga das duas bases,
**isolamento entre 2025 e 2026** (recarregar um ano não toca no outro), filtros dinâmicos,
visibilidade por perfil, lançamento do FD com todas as recusas (limite, motivador, justificativa,
limite do SQV, pool excedido), pool e resumo, layout de colunas salvo pelo Atendimento e lido pela
Consultoria, ATA obrigatória, conclusão/reabertura, consolidação e contrato de erro.

Os e2e rodam contra o banco **`discretionary_test`**, criado automaticamente — a base de
desenvolvimento não é tocada.

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| -------- | ------ | --------- |
| `NODE_ENV` | `development` | Ambiente |
| `BACKEND_PORT` | `3000` | Porta no host |
| `API_PREFIX` | `api/v1` | Prefixo global |
| `CORS_ORIGINS` | `*` | Origens permitidas |
| `DATABASE_HOST` | `postgres` | Host do banco (nome do serviço Docker) |
| `DATABASE_PORT` / `DATABASE_NAME` / `DATABASE_USER` / `DATABASE_PASSWORD` | `5432` / `discretionary` / `postgres` / `postgres` | Conexão |
| `DATABASE_EXTERNAL_PORT` | `5432` | Porta do Postgres publicada no host |
| `DATABASE_LOGGING` | `false` | Loga as queries |
| `DATABASE_RUN_MIGRATIONS` | `true` | Roda migrations na subida |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | — / `8h` | Token |
| `UPLOAD_MAX_FILE_SIZE_MB` | `50` | Tamanho máximo do arquivo |
| `POOL_PERCENTUAL` | `0.01` | Premissa **padrão de ciclos novos** (cada ciclo guarda a sua) |
| `LIMITE_DISCRICIONARIO` | `0.15` | Idem, para o limite do FD |
| `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` / `PGADMIN_PORT` | `admin@...` / `admin` / `5050` | pgAdmin |
| `SEED_SENHA_PADRAO` / `SEED_QTD_PARTICIPANTES` / `SEED_ANOS` | `Senha@123` / `1200` / `2025,2026` | Seed |

As premissas que valem em produção são as da tabela `ciclos`, editáveis por
`PATCH /ciclos/:id/premissas`.

---

## Perfis e visibilidade

| Perfil | Responsabilidades | Enxerga |
| ------ | ----------------- | ------- |
| **ADMIN** | Gerencia a ferramenta, carrega as bases, administra usuários, premissas e ciclos, consulta a trilha | Tudo |
| **ATENDIMENTO** | Cria e gerencia comitês, monta a tabela, cadastra ATAs, acompanha a consolidação | Comitês que criou e aqueles em que é backup |
| **CONSULTORIA** | Participa dos comitês sob sua responsabilidade, lança o FD, registra motivador e justificativa, cadastra a ATA | Apenas comitês em que é responsável |

A regra é aplicada **no banco**, por `EXISTS` sobre `comite_responsaveis`: um comitê que o usuário
não pode ver não aparece nem no total da paginação, e `GET /comites/:id` responde 404 (não 403),
para não revelar a existência de comitês de outras equipes.

| Recurso | ADMIN | ATENDIMENTO | CONSULTORIA |
| ------- | :---: | :---------: | :---------: |
| Consultas (dentro da visibilidade) | ✅ | ✅ | ✅ |
| Upload de bases, ciclos e premissas | ✅ | — | — |
| Criar/editar comitê, vincular participantes, montar a tabela | ✅ | ✅ | — |
| Lançar discricionário e cadastrar ATA | ✅ | ✅ | ✅ |
| Concluir comitê | ✅ | ✅ | ✅ |
| Reabrir comitê | ✅ | ✅ | — |
| Excluir comitê, gerenciar usuários e motivadores | ✅ | — | — |

---

## Regras de negócio

### Fórmulas (seção 5 da documentação)

```text
FPI_FINAL    = FPI + FD
VL_PR_I      = CALC4 × FPI              (PR antes do discricionário)
VL_PR_F      = CALC4 × FPI_FINAL        (PR depois do discricionário)
PR SEM DISC. = VL_PR_I + Σ acréscimo (VL_PR_I do acréscimo)
PR PÓS DISC. = VL_PR_F + Σ acréscimo (recalculado com o MESMO FD do titular)
DIFERENÇA    = arredondar(PR pós − PR sem; 2)
N PÓS DISC.  = nota interpolada na curva P1..P5 / N1..N5 a partir do FPI_FINAL
% RV {A}x{P} = (PR pós ÷ PR_ANO_ANTERIOR2) − 1
% TC {A}x{P} = (TOTAL_CASH ÷ TOTAL_CASH_ANO_ANTERIOR2) − 1
```

**Sócios** (fator PEP 0,725 e diferimento 0,70, ambos por ciclo):

```text
TC + P.Sócios {P} = SOCIO_{ano-1} ? (PR_ANO_ANTERIOR2 × 0,725 × 0,70) + TC_{P} : TC_{P}
TC + P.Sócios {A} = SOCIO_{ano}   ? (PR pós disc.     × 0,725 × 0,70) + TC_{A} : TC_{A}
Delta             = (TC+P.Sócios{A} ÷ TC+P.Sócios{P}) − 1
```

O **CALC4 é a base do PR**, não o PR: o que muda entre o valor inicial e o final
é apenas o fator aplicado sobre ele (o FPI vira FPI_FINAL = FPI + FD).

```text
CALC4 R$ 500.000,00 · FPI 1,05 · FD 0,05
  -> FPI_FINAL 1,10 · VL_PR_I R$ 525.000,00 · VL_PR_F R$ 550.000,00
  -> impacto no pool R$ 25.000,00
```

O `VL_PR_I` que vem no arquivo é apenas conferência: a API sempre regrava
`CALC4 × FPI`, então base e PR nunca ficam incoerentes.

Todo cálculo vive no `CalculoService` e usa `decimal.js`. O frontend só exibe.

### Fator Discricionário

- Aceita **positivo, negativo e zero**.
- Limite padrão **±0,15 (±15pp)**, configurável por ciclo.
- **Motivador e justificativa são obrigatórios** em todo lançamento diferente de zero.
- **Zerar o FD remove** automaticamente motivador e justificativa.
- **Acima do limite**, a operação é recusada e só passa com `"confirmarForaDoLimite": true`; o
  registro fica sinalizado (`fdForaLimite`) e a auditoria grava `DISCRICIONARIO_FORA_LIMITE`.
- O **motivador pode ter limite próprio** — é assim que "SQV (com impacto limitado a ±5pp)" fica
  configurado na tabela `motivos`, e não no código. O limite do motivador nunca afrouxa o do ciclo.
- **Comitê concluído bloqueia** nota, motivo, justificativa e ATA — é preciso reabrir.

### Pool do comitê

```text
Σ VLR_TEÓRICO  = VLR_TEORICO dos participantes + acréscimos com FLAG_CALCULAR_POOL = Verdadeiro
Pool disponível = Σ VLR_TEÓRICO × 1%
Pool consumido  = Σ (PR pós disc. − PR sem disc.)
Saldo           = Pool disponível − Pool consumido
```

**O lançamento que estoura o pool é recusado** (HTTP 422, `POOL_EXCEDIDO`), com o disponível, o
consumo projetado e o excedente na resposta. Lançamentos negativos devolvem verba ao pool.

> A premissa `bloquearPoolExcedido` do ciclo permite voltar ao comportamento do documento — aceitar
> o lançamento, sinalizar e cobrar `confirmarPoolExcedido: true` só na conclusão do comitê. O
> padrão entregue é **bloquear**.

### Limite por nível de cargo

```text
HC Máx.  = arredondar para cima (HC Total do nível/modelo ÷ 3)
Checagem = "REVER" quando HC c/Disc. > HC Máx.; senão "OK"
```

A checagem **alerta**, não bloqueia: aparece no resumo do comitê e na consolidação.

### Base de acréscimo

Um acréscimo só entra no PR e no pool quando **`FLAG_CALCULAR_POOL = Verdadeiro`**,
**`TIPO_SIMULADOR = "Institucional"`** e **`IDPOOL = "Dentro de Pool"`**. O casamento é por
**EMPLID** — o `GRUPO_RANKING` pode vir vazio, já que o grupo está definido na base principal.
As linhas não elegíveis **são gravadas mesmo assim**, marcadas como tal, para que a tela consiga
explicar por que um acréscimo não entrou.

### Conclusão do comitê

Bloqueiam a conclusão: comitê sem participantes, **ATA incompleta** (data, hora de início, hora de
fim e ao menos um participante) e **discricionário sem motivador ou justificativa**.
`GET /comites/:id/pendencias` lista exatamente o que falta, separando o que bloqueia do que apenas
alerta.

---

## Upload das bases

Formato: **CSV UTF-8**, delimitador `;`, `,`, tab ou `|` detectado automaticamente. Cabeçalhos são
comparados sem acento, espaço ou diferença de caixa. Exemplos em [`exemplos/`](exemplos).
`GET /uploads/layouts` devolve o layout esperado em tempo de execução.

### TBPR_Simuladores (base principal)

Obrigatórias: `EMPLID`, `NAME`, `FPI`, `CALC4`, `VALORBASE`, `VLR_TEORICO`.
O `CALC4` é a **base** do PR — o `VL_PR_I` da planilha é conferência, porque a API
sempre grava `CALC4 × FPI`.
Opcionais: todas as demais da seção 4.1 (`NATIONAL_ID`, `LAST_HIRE_DT`, `COMPANY`, `JOBCODE`,
`MANAGER_LEVEL`, `XLATLONGNAME`, `DEPTID`, `AREA`, `AREA_ORIGEM`, `IDSUBMODELO`, `VLBASEMES`,
`FPBA`, `NOTA`, `FD`, `CALC1..CALC4`, `GRUPO_RANKING`, `IDPOOL`, `IDCURVA`, `VB_ANO_ANTERIOR`,
`PR_ANO_ANTERIOR1..3`, `TOTAL_CASH` e anteriores, `VL_PR_I`, `MODELO_AVALIACAO`, `FLAG_COMUNIDADE`,
`STATUS_CONTRATO`, `SOCIO_ANO` / `SOCIO_ANO_ANTERIOR`, `P1..P5` / `N1..N5` da curva).
Colunas fora da lista são ignoradas e reportadas.

### TBPR_Simuladores_Acres (acréscimo)

Obrigatórias: `EMPLID`, `FLAG_CALCULAR_POOL`, `TIPO_SIMULADOR`, `IDPOOL`, `VLR_TEORICO`.
Opcionais: `VL_PR_I`, `CALC4`, `FPI`, `GRUPO_RANKING`, `AREA`.
Com `CALC4` e `FPI` próprios, o acréscimo acompanha o discricionário do titular
(`CALC4 × (FPI + FD)`); sem eles, entra pelo `VL_PR_I` informado, sem efeito do FD.

### Modos de carga

| Modo | Efeito |
| ---- | ------ |
| **COMPLETA** (principal) | Reinicia **o ciclo alvo**: apaga comitês, ATAs, layouts, acréscimos e participantes *daquele ano* e recria a base. Exige `confirmarReinicioDoCiclo: true` quando já há trabalho no ciclo. |
| **PARCIAL** (principal) | Atualiza e insere **preservando as decisões do comitê**; `FPI_FINAL` e `VL_PR_F` são recalculados. Colunas ausentes do arquivo mantêm o valor do banco. |
| Acréscimo | Sempre recarregada por inteiro **dentro do ciclo**. |

### Vínculo automático pelo GRUPO_RANKING

Como o `GRUPO_RANKING` da base já define o comitê do colaborador, a carga cria os comitês que ainda
não existem no ciclo e vincula os participantes **ainda sem comitê** — sem desfazer ajustes manuais
do Atendimento. Desligue com `vincularPorGrupoRanking: false`.

### Pré-visualização

`POST /uploads/previa` lê o arquivo **sem gravar nada** e devolve colunas reconhecidas e ignoradas,
registros válidos e com erro, quantos são novos, quantos serão atualizados e — na carga completa —
exatamente o que o reinício apagaria.

```jsonc
{
  "ciclo": 2027,
  "modo": "COMPLETA",
  "colunasReconhecidas": ["EMPLID", "NAME", "FPI", "CALC4", "..."],
  "colunasIgnoradas": ["COLUNA_NOVA"],
  "totalRegistros": 13000, "registrosValidos": 12980, "registrosComErro": 20,
  "novos": 12500, "atualizados": 480,
  "impactoDoReinicio": { "participantes": 12800, "comites": 42, "atas": 40, "discricionariosLancados": 310 }
}
```

Registros inválidos não derrubam o arquivo: os válidos entram e os inválidos ficam registrados com
linha, coluna, valor e motivo (`GET /uploads/:id/erros`). Todo o processamento roda em transação.

---

## Telas suportadas

A API entrega pronta cada parte da tela de comitê:

| Tela / aba | Endpoint |
| ---------- | -------- |
| Lista de comitês | `GET /comites?ciclo=2026` |
| **Aba 1 — Avaliação Discricionária** | |
| Tabela de participantes (37 colunas, campos calculados) | `GET /comites/:id/participantes` |
| Resumo por Nível de Cargo (Institucional / Comunidade) | `GET /comites/:id/resumo` |
| Performance ponderada por VB, antes e depois | idem, em `performancePonderada` |
| Lançar o FD, motivador e justificativa | `PATCH /participantes/:id/discricionario` |
| Gráfico Total Cash × RV × TC + P.Sócios | `GET /participantes/:id/graficos` |
| **Aba 2 — Distribuição do Pool** | |
| Σ VLR_TEÓRICO, pool, consumo, saldo e % | `GET /comites/:id/pool` |
| Lista nominal dos discricionários | `GET /comites/:id/discricionarios` |
| **Aba 3 — Cadastrar ATA** | `GET` / `PUT /comites/:id/ata` |
| **Consolidação** | `GET /consolidacao/visao-geral`, `/comparativo`, `/discricionarios-nominais`, `/controle-grupos` |
| **Pesquisa funcional** | `GET /participantes/pesquisa?termo=` |
| **Premissas e logs** | `GET /ciclos/:id`, `GET /audit` |

O resumo por nível devolve, para cada nível × modelo: `hcTotal`, `hcMaximo`, `reducao`, `aumento`,
`hcComDiscricionario`, `checagem` (`OK` / `REVER`), `discricionarioPositivo`,
`discricionarioNegativo` e `saldo` — exatamente as colunas da tela.

---

## Tabela customizável

O **Atendimento monta o comitê e salva o layout**; a **Consultoria abre e já vê do jeito montado**.

```http
GET /participantes/colunas        # catálogo: chave, rótulo, grupo, tipo, origem, ordenável
GET /comites/:id/colunas          # layout efetivo (o salvo, ou o padrão)
PUT /comites/:id/colunas          # salva (ADMIN / ATENDIMENTO)
DELETE /comites/:id/colunas       # volta ao layout padrão
```

```jsonc
// PUT /comites/:id/colunas
{
  "colunas": [
    { "chave": "nome", "visivel": true, "ordem": 0, "fixa": true, "largura": 240 },
    { "chave": "fd", "visivel": true, "ordem": 1, "rotulo": "Discricionário (pp)" },
    { "chave": "prPosDiscricionario", "visivel": true, "ordem": 2 },
    { "chave": "totalCash", "visivel": false, "ordem": 3 }
  ]
}
```

O catálogo é a fonte da verdade: colunas novas entram como invisíveis em layouts antigos, sem
quebrar nada, e uma chave fora do catálogo é recusada com 400. As colunas estão agrupadas em
Identificação, Cargo e área, Performance, Remuneração variável, Discricionário, Comparativos,
Total Cash e Controle — cada uma com `tipo` (`moeda`, `percentual`, `pontos_percentuais`, `texto`,
`data`, `booleano`) para o frontend formatar sem regra própria.

---

## API

Prefixo `/api/v1`. Tudo exige JWT, exceto `POST /auth/login`. Documentação interativa em
`/api/v1/docs`.

### Convenções (seção 9.1)

- **Paginação**: `?page`, `?limit`, `?sortBy`, `?order`
- **Filtros dinâmicos**: `?filter=campo:operador:valor`, repetível, combinados com AND —
  `eq, ne, like, ilike, gt, gte, lt, lte, in, null, notnull, between`
- **Soft delete**: `DELETE` remove logicamente; `?withDeleted=true` inclui removidos;
  `PATCH /:id/restore` restaura
- **Ciclo**: `?ciclo=2026` em qualquer listagem; omitido, usa o ciclo ativo

```http
GET /api/v1/participantes?ciclo=2026&page=1&limit=50&search=joao&filter=fd:gt:0&filter=nivelCargo:eq:Gerente&sortBy=nome&order=ASC
```

```json
{ "data": [], "page": 1, "limit": 50, "total": 13000, "totalPages": 260 }
```

Campos de ordenação e de filtro passam por **lista branca** por recurso: um campo desconhecido
devolve 400 em vez de virar SQL.

### Endpoints

```text
POST   /auth/login                         GET    /auth/me            POST /auth/logout

GET    /ciclos                             POST   /ciclos
GET    /ciclos/anos                        GET    /ciclos/ativo       GET  /ciclos/:id
PATCH  /ciclos/:id/ativar                  PATCH  /ciclos/:id/fechar
PATCH  /ciclos/:id/reabrir                 PATCH  /ciclos/:id/premissas

POST   /uploads                            POST   /uploads/previa
GET    /uploads                            GET    /uploads/layouts
GET    /uploads/:id                        GET    /uploads/:id/erros

GET    /participantes                      GET    /participantes/:id
GET    /participantes/colunas              GET    /participantes/filtros
GET    /participantes/ids                  GET    /participantes/pesquisa?termo=
GET    /participantes/:id/graficos
PATCH  /participantes/:id/discricionario   DELETE /participantes/:id/discricionario

GET    /comites                            POST   /comites
GET    /comites/:id                        PUT    /comites/:id
DELETE /comites/:id                        PATCH  /comites/:id/restore
PATCH  /comites/:id/concluir               PATCH  /comites/:id/reabrir
GET    /comites/:id/participantes          POST   /comites/:id/participantes
DELETE /comites/:id/participantes
GET    /comites/:id/resumo                 GET    /comites/:id/pool
GET    /comites/:id/discricionarios        GET    /comites/:id/pendencias
GET    /comites/:id/colunas                PUT    /comites/:id/colunas
DELETE /comites/:id/colunas
GET    /comites/:id/ata                    PUT    /comites/:id/ata

GET    /motivos                            GET    /motivos/ativos
POST   /motivos                            PUT    /motivos/:id
DELETE /motivos/:id                        PATCH  /motivos/:id/restore

GET    /consolidacao/visao-geral           GET    /consolidacao/comparativo
GET    /consolidacao/discricionarios-nominais
GET    /consolidacao/controle-grupos

GET    /usuarios                           POST   /usuarios           PUT  /usuarios/:id
GET    /audit                              POST   /audit
GET    /audit/comites/:comiteId/participantes/:participanteId
```

---

## Auditoria

O `AuditoriaModule` é global e independente. A tabela é **append-only** — nenhum serviço faz UPDATE
ou DELETE nela — e uma falha ao auditar nunca derruba a operação de negócio.

Cada registro guarda **ação, operação (INSERT/UPDATE/SOFT_DELETE/RESTORE), entidade, ciclo, comitê,
participante, usuário, campo alterado, valor anterior, novo valor, justificativa, IP e user-agent**.
Alterar vários campos gera **um registro por campo**.

Ações cobertas: login/logout/login falho; criação, ativação, fechamento e reabertura de ciclo;
alteração de premissas; upload iniciado/concluído/falho; criação, alteração, conclusão, reabertura,
remoção e restauração de comitê; alteração do layout de colunas; vínculo e desvínculo de
participante; lançamento, alteração, zeramento e **estouro de limite** do discricionário; alteração
de motivador e de justificativa; cadastro e alteração de ATA; CRUD de motivadores; e ações vindas
do frontend.

### Auditoria do frontend

```typescript
auditService.log({
  action: 'UPDATE_DISCRETIONARY',
  entity: 'PARTICIPANT',
  entityId: participant.id,
  details: { /* ... */ },
});
```

Vai para `POST /audit` e é gravada com `origem = FRONTEND`. Rótulos que não correspondem a uma ação
conhecida viram `ACAO_FRONTEND`, com o rótulo original em `detalhes.acaoOriginal`. A auditoria
oficial continua sendo a do backend.

---

## Tratamento de erros

Um filtro global padroniza **toda** resposta de erro:

```json
{
  "statusCode": 422,
  "message": "Operação não permitida: o lançamento ultrapassa o pool disponível do comitê",
  "error": "Unprocessable Entity",
  "codigo": "POOL_EXCEDIDO",
  "detalhes": {
    "poolDisponivel": 4200,
    "poolConsumidoProjetado": 18000,
    "excedente": 13800,
    "impactoSolicitado": 15000
  },
  "timestamp": "2026-09-13T12:00:00.000Z",
  "path": "/api/v1/participantes/.../discricionario"
}
```

| Código | HTTP | Situação |
| ------ | :--: | -------- |
| `UPLOAD_INVALIDO` | 400 | Arquivo vazio, ilegível ou sem colunas obrigatórias |
| `DISCRICIONARIO_INVALIDO` | 400 | FD fora do limite (traz `exigeConfirmacao`) ou não numérico |
| `POOL_EXCEDIDO` | 422 | Lançamento ultrapassa o pool disponível |
| `MOTIVADOR_OBRIGATORIO` / `JUSTIFICATIVA_OBRIGATORIA` | 422 | Discricionário sem motivador ou justificativa |
| `PARTICIPANTE_JA_ALOCADO` | 422 | Colaborador já está em outro comitê (a resposta diz qual) |
| `PARTICIPANTE_SEM_COMITE` | 422 | Lançamento em participante não vinculado |
| `COMITE_CONCLUIDO` | 422 | Comitê concluído bloqueia edição |
| `COMITE_COM_PENDENCIAS` | 422 | ATA incompleta ou pendências de motivador/justificativa |
| `POOL_EXCEDIDO_NAO_CONFIRMADO` | 422 | Conclusão com pool estourado sem confirmação |
| `REINICIO_DE_CICLO_NAO_CONFIRMADO` | 422 | Carga completa em ciclo com trabalho lançado |
| `CICLO_FECHADO` | 422 | Tentativa de escrita em ano histórico |
| `SEM_CICLO_ATIVO` | 422 | Nenhum ciclo ativo configurado |
| `REGISTRO_DUPLICADO` | 409 | Violação de unicidade |

---

## Evolução

- **Nova coluna na base**: acrescente a definição em `uploads/services/mapeamento-colunas.ts` e a
  coluna por migration. Para que ela apareça na tela, adicione também ao catálogo em
  `participantes/colunas-participante.ts`. Nenhum outro ponto do sistema conhece nomes de coluna.
- **Novo motivador** (ou mudança no limite do SQV): cadastro em `/motivos`, sem deploy.
- **Novo ano**: `POST /ciclos` herda as premissas do anterior; feche o ano velho para virar
  histórico.
- **Mudança de premissa**: `PATCH /ciclos/:id/premissas` — vale só daquele ano em diante.
- **Pool bloqueante ou apenas sinalizado**: premissa `bloquearPoolExcedido` por ciclo.
- **Outro formato de arquivo** (XLSX): implemente um leitor com a mesma interface do `CsvService`;
  o restante do fluxo não muda.
- **Frontend Angular**: contratos REST, paginação no banco, catálogo de colunas, layout por comitê
  e endpoint de auditoria do frontend já estão prontos para consumo.
