# API — Discricionário de Remuneração

API REST para administrar valores de **discricionário** destinados a participantes de grupos e comitês:
upload das bases, montagem de grupos, criação de comitês, análise participante a participante, controle do
pool, cálculo dos valores e auditoria completa de todas as operações.

O ambiente sobe inteiro com `docker compose up`: PostgreSQL, backend NestJS e pgAdmin.

---

## Sumário

- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Como executar](#como-executar)
- [Como parar](#como-parar)
- [Acessos](#acessos)
- [Migrations](#migrations)
- [Seed](#seed)
- [Testes](#testes)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Regras de negócio](#regras-de-negócio)
- [Upload das bases](#upload-das-bases)
- [Endpoints](#endpoints)
- [Auditoria](#auditoria)
- [Segurança](#segurança)
- [Tratamento de erros](#tratamento-de-erros)
- [Evolução](#evolução)

---

## Arquitetura

Backend NestJS modular, com separação estrita de responsabilidades: os controllers só recebem e devolvem
DTOs, os services concentram as regras, e os cálculos financeiros vivem em um serviço dedicado
(`CalculoService`). Nenhuma entidade é exposta diretamente nos contratos REST.

```text
discricionario-remuneracao/
├── backend/
│   ├── src/
│   │   ├── auth/             # JWT, guards, decorators, perfis
│   │   ├── usuarios/         # CRUD de usuários e hash de senha
│   │   ├── participantes/    # Base principal + acréscimos, busca e filtros
│   │   ├── grupos/           # Grupos, responsáveis e seleção de participantes
│   │   ├── comites/          # Comitês, análises e navegação participante a participante
│   │   ├── discricionario/   # Discricionário, cálculo, pool e resumos
│   │   ├── uploads/          # Leitura/validação de CSV e processamento das bases
│   │   ├── auditoria/        # Módulo independente de auditoria (append-only)
│   │   ├── dashboard/        # Consolidação da página inicial
│   │   ├── database/         # DataSource, migrations e seed
│   │   ├── common/           # DTOs de paginação, filtros de erro, enums, utilitários
│   │   └── config/           # Leitura centralizada das variáveis de ambiente
│   ├── test/                 # Testes de integração (e2e)
│   └── Dockerfile
├── exemplos/                 # CSVs de exemplo das duas bases
├── infra/pgadmin/            # Conexão pré-configurada do pgAdmin
├── docker-compose.yml
├── .env.example
└── README.md
```

**Dependência entre módulos** (sempre em uma direção, sem ciclos):

```text
ComitesModule ──► DiscricionarioModule ──► CalculoModule
      │                    │
      └────► ParticipantesModule ─────────► CalculoModule

GruposModule ──► ParticipantesModule + UsuariosModule + CalculoModule
UploadsModule ─► CalculoModule
AuditoriaModule (global) ◄── todos os módulos de negócio
```

**Cadeia de persistência:**

```text
Grupo → Participantes → Comitê → Análise do participante → Discricionário
```

| Tabela                     | Papel |
| -------------------------- | ----- |
| `usuarios`                 | Usuários e perfis de acesso |
| `participantes`            | Base principal (dados e valores usados nos cálculos) |
| `acrescimos_participante`  | Base de acréscimo (complementos por área de origem) |
| `grupos`                   | Grupos de participantes |
| `grupo_responsaveis`       | Consultoras, backups e criador de cada grupo (N por grupo) |
| `grupo_participantes`      | Vínculo grupo ↔ participante |
| `comites`                  | Comitês, sempre ligados a um grupo |
| `analises_participante`    | Um participante dentro de um comitê + ordem de navegação |
| `discricionarios`          | FD lançado + snapshot dos valores calculados |
| `avaliacoes_comportamentais` | Tabela de domínio das opções de avaliação |
| `importacoes` / `erros_importacao` | Histórico dos uploads e registros inválidos |
| `auditoria_logs`           | Trilha de auditoria (append-only) |

---

## Tecnologias

- **NestJS 10** + **TypeScript 5**
- **TypeORM 0.3** com **PostgreSQL 16** (migrations; `synchronize` desligado)
- **class-validator** / **class-transformer** para os DTOs
- **decimal.js** em todos os cálculos financeiros (sem erro de ponto flutuante)
- **Passport JWT** para autenticação, guards para controle de acesso por perfil
- **csv-parse** para leitura das bases
- **Swagger** para documentação da API
- **Jest** + **Supertest** para testes unitários e de integração
- **Docker Compose**: PostgreSQL, backend e pgAdmin

---

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- (Opcional, para rodar fora do Docker) Node.js 22+ e um PostgreSQL 16 acessível

---

## Como executar

```bash
# 1. Clonar e entrar no projeto
cd discricionario-remuneracao

# 2. Criar o arquivo de ambiente
cp .env.example .env

# 3. Subir tudo
docker compose up --build
```

Na primeira subida o backend aguarda o PostgreSQL ficar saudável e executa as migrations automaticamente
(`DATABASE_RUN_MIGRATIONS=true`). Quando aparecer `API disponível em http://localhost:3000/api`, o ambiente
está pronto.

Em seguida, popule o banco com a massa fictícia:

```bash
docker compose exec backend npm run seed
```

### Rodando sem Docker

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
docker compose restart backend # reinicia só o backend
```

> Se você alterar o `package.json`, recrie o volume de dependências:
> `docker compose down -v && docker compose up --build`.

---

## Acessos

| Serviço      | URL                                 | Credenciais |
| ------------ | ----------------------------------- | ----------- |
| API          | http://localhost:3000/api           | JWT (ver abaixo) |
| Swagger      | http://localhost:3000/api/docs      | — |
| pgAdmin      | http://localhost:5050               | `admin@discricionario.local` / `admin` |
| PostgreSQL   | `localhost:5432`                    | `postgres` / `postgres` |

O pgAdmin já vem com o servidor **"Discricionario - Local"** cadastrado. Ao expandi-lo pela primeira vez,
informe a senha do Postgres (`postgres`).

### Usuários criados pelo seed

| E-mail                                | Perfil       | Senha       |
| ------------------------------------- | ------------ | ----------- |
| `admin@discricionario.local`          | ADMIN        | `Senha@123` |
| `atendimento1@discricionario.local`   | ATENDIMENTO  | `Senha@123` |
| `atendimento2@discricionario.local`   | ATENDIMENTO  | `Senha@123` |
| `consultoria1@discricionario.local`   | CONSULTORIA  | `Senha@123` |
| `consultoria2@discricionario.local`   | CONSULTORIA  | `Senha@123` |

Obtendo um token:

```bash
curl -X POST http://localhost:3000/api/autenticacao/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@discricionario.local","senha":"Senha@123"}'
```

Use o `accessToken` retornado no header `Authorization: Bearer <token>` (ou no botão **Authorize** do Swagger).

---

## Migrations

O schema **nunca** é criado por `synchronize`: só por migration.

```bash
# dentro do container
docker compose exec backend npm run migration:run
docker compose exec backend npm run migration:revert

# gerar uma nova migration a partir das entidades
docker compose exec backend npm run migration:generate -- src/database/migrations/NomeDaMigration

# criar uma migration vazia
docker compose exec backend npm run migration:create src/database/migrations/NomeDaMigration
```

Fora do Docker, rode os mesmos comandos em `backend/` com `npm run ...`.

O histórico fica na tabela `migrations_historico`.

---

## Seed

```bash
docker compose exec backend npm run seed            # popula (mantém o que já existe)
docker compose exec backend npm run seed:reset      # limpa as tabelas e popula do zero
docker compose exec backend npm run seed -- --qtd=5000
```

O seed é **determinístico** (mesma semente ⇒ mesma massa) e cria:

- 5 usuários (um por perfil relevante);
- 1.500 participantes fictícios (configurável) com cargos, níveis, áreas e valores variados;
- acréscimos para os ~20% que passaram por mais de uma área;
- 4 grupos com consultoras, backups e centenas de participantes;
- 4 comitês com a navegação montada;
- discricionários lançados em ~60% das análises, **sempre respeitando o pool**.

> ⚠️ **Todos os dados do seed são fictícios** e existem apenas para desenvolvimento e testes: nomes,
> matrículas e valores não correspondem a pessoas ou remunerações reais.

O volume gerado é suficiente para exercitar paginação, busca, filtros, cálculos, pool, navegação
participante a participante e o resumo por nível de cargo.

---

## Testes

```bash
# unitários
docker compose exec backend npm test
docker compose exec backend npm run test:cov

# integração (e2e) — usa um banco separado, criado automaticamente
docker compose exec backend npm run test:e2e
```

**Cobertura de testes unitários:** cálculo do PR inicial e final, cálculo do FPI_FINAL, aplicação dos
acréscimos, cálculo e consolidação do pool, validação do discricionário (limite de ±15pp), atualização da
análise do participante, atualização do resumo por nível de cargo, precisão decimal, leitura e validação
dos CSVs e o serviço de auditoria.

**Testes de integração:** autenticação e bloqueio de rota protegida, upload das duas bases (incluindo
arquivo inválido e registros com erro), paginação/busca/filtros de participantes, criação de grupo e
cálculo do pool, criação de comitê e navegação, lançamento de discricionário com atualização de pool e
resumo, bloqueio por estouro de pool, consulta de auditoria, dashboard e contrato padrão de erro.

Os testes e2e rodam contra o banco **`discretionary_test`** (criado automaticamente na primeira execução),
justamente porque os cenários de upload completo apagam todas as tabelas — a base de desenvolvimento não é
tocada.

---

## Variáveis de ambiente

Todas ficam no `.env` da raiz (veja `.env.example`).

| Variável | Padrão | Descrição |
| -------- | ------ | --------- |
| `NODE_ENV` | `development` | Ambiente de execução |
| `BACKEND_PORT` | `3000` | Porta exposta no host |
| `API_PREFIX` | `api` | Prefixo global das rotas |
| `CORS_ORIGINS` | `*` | Origens permitidas (separadas por vírgula) |
| `DATABASE_HOST` | `postgres` | Host do banco — dentro do Docker é o **nome do serviço** |
| `DATABASE_PORT` | `5432` | Porta do banco |
| `DATABASE_NAME` | `discretionary` | Nome do banco |
| `DATABASE_USER` | `postgres` | Usuário do banco |
| `DATABASE_PASSWORD` | `postgres` | Senha do banco |
| `DATABASE_EXTERNAL_PORT` | `5432` | Porta do Postgres publicada no host |
| `DATABASE_LOGGING` | `false` | Loga as queries do TypeORM |
| `DATABASE_RUN_MIGRATIONS` | `true` | Roda migrations pendentes na subida |
| `JWT_SECRET` | `troque-este-segredo-em-producao` | Segredo de assinatura do token |
| `JWT_EXPIRES_IN` | `8h` | Validade do token |
| `UPLOAD_MAX_FILE_SIZE_MB` | `50` | Tamanho máximo do arquivo de upload |
| `POOL_PERCENTUAL` | `0.01` | Percentual do VLRTEORICO que forma o pool (1%) |
| `LIMITE_DISCRICIONARIO` | `0.15` | Limite absoluto do discricionário (15pp) |
| `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` / `PGADMIN_PORT` | `admin@...` / `admin` / `5050` | Acesso ao pgAdmin |
| `SEED_SENHA_PADRAO` | `Senha@123` | Senha dos usuários do seed |
| `SEED_QTD_PARTICIPANTES` | `1500` | Participantes gerados pelo seed |

---

## Regras de negócio

### Fórmulas

Todo cálculo acontece no backend (`CalculoService`). A API devolve os resultados prontos; o frontend
apenas exibe.

```text
FPI_FINAL  = FPI + FD
PR_INICIAL = VALORBASE × FBPA × FPI
PR_FINAL   = VALORBASE × FBPA × FPI_FINAL
IMPACTO    = PR_FINAL − PR_INICIAL
```

Os valores inicial e final são mantidos separados: o discricionário nunca sobrescreve o PR inicial.

### Discricionário

- Aceita valores **positivos, negativos e zero**.
- Limite: **−0,15 a +0,15** (−15pp a +15pp). Qualquer valor dentro do intervalo é válido
  (`0,07`, `-0,015`, `0`, …).
- A validação existe em três camadas: DTO (`@Min`/`@Max`), `CalculoService.validarValorFd` e uma
  `CHECK` constraint no banco.
- A avaliação comportamental é uma **tabela de domínio** (`avaliacoes_comportamentais`), já semeada com
  `SQV`, `TODOS`, `PERFORMANCE` e o placeholder `A_DEFINIR` — a quarta opção pode ser renomeada por
  `UPDATE`, sem migration nem deploy.

### Pool

```text
POOL = 1% do VLRTEORICO total do grupo

Ex.: VLRTEORICO total = R$ 10.000.000  →  POOL = R$ 100.000
```

- **Pool utilizado** = soma dos impactos positivos − soma dos impactos negativos.
- **Pool disponível** = pool total − pool utilizado.
- Lançamentos que deixariam o pool disponível negativo são **bloqueados** (HTTP 422, `POOL_EXCEDIDO`),
  com o excedente informado na resposta.
- Ao **alterar** um lançamento existente, o impacto anterior é descontado antes da verificação.
- A base do pool é o `VLRTEORICO` da **área atual** — acréscimos de outras áreas não entram no pool.

### Acréscimos e visão anual

Participantes que passaram por mais de uma área têm registros na base de acréscimo. Esses valores são
somados a `VL_PR_I` e `VL_PR_F` apenas na **visão anual** exibida no comitê
(`valorPrIAnual` / `valorPrFAnual`), para que o comitê enxergue o ano completo do colaborador. O pool
continua calculado sobre a área atual.

### Sequência de gravação do discricionário

Ao salvar (`POST /api/discricionarios`), na ordem:

1. **Validar** — limite de ±15pp e situação do comitê (finalizado/aprovado/cancelado não aceitam alteração).
2. **Calcular** — FPI_FINAL, PR inicial, PR final e impacto.
3. **Verificar o pool** — bloqueia o que ultrapassa o disponível.
4. **Persistir** — discricionário e status da análise, em transação.
5. **Auditar** — um registro por campo alterado (valor, justificativa, avaliação comportamental).
6. **Atualizar pool e resumo** — devolvidos na mesma resposta.
7. **Próximo participante** — quando `avancarParaProximo: true`.

---

## Upload das bases

Formato aceito: **CSV** (UTF-8; delimitador `;`, `,`, tab ou `|` detectado automaticamente).
Os cabeçalhos são comparados sem acento, espaço ou diferença de caixa — `Nível de Cargo`, `NIVEL_CARGO` e
`nivelcargo` são equivalentes. Arquivos de exemplo em [`exemplos/`](exemplos).

`GET /api/importacoes/formatos` devolve, em tempo de execução, o layout esperado de cada base.

### Base principal

| Coluna | Obrigatória | Tipo |
| ------ | ----------- | ---- |
| `FUNCIONAL` (ou `MATRICULA`) | sim | texto |
| `NOME` | sim | texto |
| `FPI` | sim | número |
| `FBPA` | sim | número |
| `VALORBASE` | sim | número |
| `VLRTEORICO` | sim | número |
| `CARGO`, `NIVEL_CARGO`, `MODELO_AVALIACAO`, `AREA`, `AREA_ORIGEM` | não | texto |
| `FPI_FINAL`, `FD`, `VALOR_PR_I`, `VALOR_PR_F` | não | número |

`VL_PR_I`, `VL_PR_F` e `FPI_FINAL` são **sempre recalculados** pelas fórmulas oficiais, mesmo quando vêm no
arquivo — assim a base nunca diverge do que o sistema exibe. Quando o arquivo traz `FPI_FINAL` mas não traz
`FD`, o FD é deduzido (`FD = FPI_FINAL − FPI`).

### Base de acréscimo

| Coluna | Obrigatória | Tipo |
| ------ | ----------- | ---- |
| `FUNCIONAL` | sim | texto |
| `AREA_ORIGEM` | sim | texto |
| `ACRESCIMO_PR_I` | sim | número |
| `ACRESCIMO_PR_F` | sim | número |
| `OBSERVACAO` | não | texto |

### Modos de processamento

| Modo | Efeito |
| ---- | ------ |
| **COMPLETO** (base principal) | Substitui a base: limpa `discricionarios`, `analises_participante`, `comites`, `grupo_participantes`, `grupo_responsaveis`, `grupos`, `acrescimos_participante` e `participantes`, e recria os participantes do arquivo. |
| **INCREMENTAL** (base principal) | Preserva grupos e comitês: atualiza os participantes existentes (só os campos presentes no arquivo), insere os novos e **ressincroniza** os valores calculados dos discricionários já lançados. |
| **COMPLETO** (base de acréscimo) | Substitui todos os acréscimos. Não toca em grupos nem comitês. |
| **INCREMENTAL** (base de acréscimo) | Atualiza os acréscimos da mesma área de origem e insere os novos. |

### Validação e retorno

O arquivo não é rejeitado inteiro por causa de algumas linhas ruins: registros válidos são gravados e os
inválidos ficam registrados com linha, coluna, valor e motivo.

```jsonc
{
  "importacaoId": "…",
  "status": "CONCLUIDO_COM_ERROS",
  "totalRegistros": 13000,
  "registrosProcessados": 12980,
  "registrosInseridos": 12500,
  "registrosAtualizados": 480,
  "registrosComErro": 20,
  "erros": [
    { "linha": 42, "coluna": "FPI", "valor": "XPTO", "mensagem": "\"FPI\" deve ser numérico. Valor recebido: \"XPTO\"" }
  ],
  "colunasIgnoradas": ["COLUNA_NOVA"]
}
```

Todo upload — iniciado, concluído ou falho — é registrado na auditoria. O histórico fica em
`GET /api/importacoes` e os erros completos em `GET /api/importacoes/:id/erros`.

O processamento roda **dentro de uma transação**: uma falha no meio não deixa a base inconsistente.

---

## Endpoints

Todos sob o prefixo `/api` e protegidos por JWT, exceto `POST /api/autenticacao/login`.
A documentação interativa completa está no Swagger (`/api/docs`).

### Autenticação

```text
POST   /api/autenticacao/login
POST   /api/autenticacao/logout
GET    /api/autenticacao/me
```

### Importações

```text
POST   /api/importacoes                 multipart: file, tipoBase, modo
GET    /api/importacoes
GET    /api/importacoes/formatos
GET    /api/importacoes/:id
GET    /api/importacoes/:id/erros
```

### Participantes

```text
GET    /api/participantes            paginação, busca e filtros
GET    /api/participantes/filtros    valores distintos para os filtros
GET    /api/participantes/ids        só os IDs do filtro (suporte ao "selecionar todos")
GET    /api/participantes/:id        detalhe com acréscimos e visão anual
```

### Grupos

```text
GET    /api/grupos
POST   /api/grupos
GET    /api/grupos/:id
PUT    /api/grupos/:id
DELETE /api/grupos/:id
GET    /api/grupos/:id/participantes
GET    /api/grupos/:id/pool
POST   /api/grupos/:id/participantes     inclusão em lote
DELETE /api/grupos/:id/participantes     remoção em lote
```

### Comitês

```text
GET    /api/comites
POST   /api/comites
GET    /api/comites/:id
PUT    /api/comites/:id
DELETE /api/comites/:id
GET    /api/comites/:id/participantes
GET    /api/comites/:id/participantes/:analiseId
GET    /api/comites/:id/navegacao?direcao=primeiro|anterior|proximo|ultimo&analiseId=…
GET    /api/comites/:id/resumo
GET    /api/comites/:id/pool
POST   /api/comites/:id/finalizar
POST   /api/comites/:id/aprovar
```

### Discricionário

```text
GET    /api/discricionarios
GET    /api/discricionarios/avaliacoes-comportamentais
GET    /api/discricionarios/:id
POST   /api/discricionarios
PUT    /api/discricionarios/:id
DELETE /api/discricionarios/:id
```

### Painel, usuários e auditoria

```text
GET    /api/painel
GET    /api/painel/graficos
GET    /api/usuarios
POST   /api/usuarios
GET    /api/usuarios/:id
PUT    /api/usuarios/:id
GET    /api/logs-auditoria
POST   /api/logs-auditoria                                    registro vindo do frontend
GET    /api/logs-auditoria/comites/:comiteId/participantes/:participanteId
```

### Paginação, busca e filtros

Toda listagem é paginada **no banco** — a API nunca carrega milhares de registros de uma vez.

```http
GET /api/participantes?page=1&limit=50&search=joao&nivelCargo=Pleno&sortBy=nome&sortOrder=ASC
```

```json
{
  "data": [],
  "page": 1,
  "limit": 50,
  "total": 13000,
  "totalPages": 260
}
```

O campo `sortBy` é validado contra uma lista branca por recurso; um campo desconhecido devolve 400 em vez
de virar SQL.

---

## Auditoria

O `AuditoriaModule` é independente e global: qualquer service de negócio registra ações sem que os módulos
se conheçam entre si. A tabela `auditoria_logs` é **append-only** — nenhum ponto do sistema faz `UPDATE` ou
`DELETE` nela — e uma falha ao auditar nunca derruba a operação de negócio (é apenas logada).

Ações registradas: login, logout e login falho; upload iniciado/concluído/falho; criação, alteração e
exclusão de grupo; inclusão e remoção de participante; criação, alteração, exclusão, finalização e
aprovação de comitê; criação, alteração e remoção de discricionário; alteração de justificativa e de
avaliação comportamental; erros de processamento; e ações vindas do frontend.

Cada alteração de discricionário grava **usuário, data/hora, participante, comitê, campo alterado, valor
anterior, novo valor e justificativa**. Alterações de vários campos geram um registro por campo.

### Auditoria vinda do frontend

O `AuditService` do Angular envia suas ações para `POST /api/logs-auditoria`:

```typescript
auditService.log({
  action: 'UPDATE_DISCRETIONARY',
  entity: 'PARTICIPANT',
  entityId: participant.id,
  details: { /* ... */ },
});
```

Esses registros ficam marcados com `origem = FRONTEND`. Rótulos que não correspondem a uma ação conhecida
são gravados como `ACAO_FRONTEND` com o rótulo original em `detalhes.acaoOriginal`.
A auditoria **oficial**, para segurança e rastreabilidade, continua sendo a gerada pelo backend: o frontend
nunca é a única fonte.

---

## Segurança

- Autenticação **JWT** (Passport), com o token validado contra o banco a cada requisição — bloquear um
  usuário surte efeito imediato.
- `JwtAuthGuard` é global: toda rota exige autenticação, exceto as marcadas com `@Publico()`.
- `PerfisGuard` aplica o controle de acesso por perfil declarado com `@Perfis(...)`.
- Perfis: **ADMIN** (acesso irrestrito), **ATENDIMENTO**, **CONSULTORIA**.
- Senhas com hash **bcrypt**; o campo nunca é selecionado nem serializado.
- `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`: só chega ao service o que está
  declarado no DTO.
- `helmet` nos headers e CORS configurável por ambiente.

Restrições atuais por perfil (ponto de partida, fácil de ajustar nos controllers):

| Recurso | ADMIN | ATENDIMENTO | CONSULTORIA |
| ------- | :---: | :---------: | :---------: |
| Consultas em geral | ✅ | ✅ | ✅ |
| Upload de bases | ✅ | ✅ | — |
| Criar/editar grupos e comitês | ✅ | ✅ | ✅ |
| Lançar discricionário | ✅ | ✅ | ✅ |
| Finalizar comitê | ✅ | ✅ | — |
| Aprovar comitê, excluir grupo/comitê, gerenciar usuários | ✅ | — | — |

---

## Tratamento de erros

Um único filtro global padroniza **toda** resposta de erro — exceções HTTP, erros do TypeORM e falhas
inesperadas:

```json
{
  "statusCode": 400,
  "message": "Valor de discricionário inválido",
  "error": "Bad Request",
  "codigo": "DISCRICIONARIO_INVALIDO",
  "detalhes": { "valorInformado": 0.2, "limiteMinimo": -0.15, "limiteMaximo": 0.15 },
  "timestamp": "2026-09-10T12:00:00.000Z",
  "path": "/api/discricionarios"
}
```

O campo `codigo` é estável e serve para o frontend tratar cenários específicos:

| Código | HTTP | Situação |
| ------ | :--: | -------- |
| `UPLOAD_INVALIDO` | 400 | Arquivo vazio, ilegível ou sem colunas obrigatórias |
| `DISCRICIONARIO_INVALIDO` | 400 | Valor fora do intervalo de ±15pp |
| `POOL_EXCEDIDO` | 422 | Lançamento ultrapassa o pool disponível |
| `COMITE_NAO_EDITAVEL` | 422 | Comitê finalizado, aprovado ou cancelado |
| `COMITE_COM_PENDENCIAS` | 422 | Finalização com análises pendentes |
| `GRUPO_COM_COMITES` | 422 | Exclusão de grupo com comitês vinculados |
| `GRUPO_SEM_PARTICIPANTES` | 422 | Criação de comitê a partir de grupo vazio |
| `REGISTRO_DUPLICADO` | 409 | Violação de unicidade (código de grupo/comitê, funcional) |
| `NAVEGACAO_SEM_RESULTADO` | 422 | Não há participante na direção pedida |

Erros de upload trazem, além da mensagem, as colunas obrigatórias ausentes e as encontradas no arquivo.

---

## Evolução

O escopo entregue é um MVP funcional completo do backend, com a arquitetura preparada para crescer:

- **Novas colunas da base**: adicione a definição em `uploads/services/mapeamento-colunas.ts` e a coluna
  correspondente por migration. Nenhum outro ponto do sistema conhece os nomes de coluna do arquivo.
- **Quarta avaliação comportamental**: renomeie o registro `A_DEFINIR` em `avaliacoes_comportamentais`
  quando o nome for confirmado — não há enum no código nem no banco para alterar.
- **Novos formatos de upload** (XLSX, por exemplo): implemente um leitor com a mesma interface do
  `CsvService`; o restante do fluxo não muda.
- **Regras por perfil**: ajuste os decorators `@Perfis(...)` nos controllers.
- **Percentual do pool e limite do discricionário**: já são configuráveis por variável de ambiente.
- **Frontend Angular**: os contratos REST, a paginação no backend e o endpoint de auditoria do frontend
  já estão prontos para consumo.
