# Frontend — Discricionário de Remuneração

Angular 18 + Angular Material 3, standalone components e signals.
Nenhuma conta financeira acontece aqui: FPI_FINAL, VL_PR_I, VL_PR_F, PR pré e pós,
impacto no pool, nota interpolada e performance ponderada chegam calculados da API
em `decimal.js`. O frontend escolhe o ciclo, mostra o que a API devolve e envia
uma única decisão por participante — o FD.

---

## Subir

Junto com a API, pelo compose da raiz:

```bash
docker compose up --build
# front  http://localhost:4200
# API    http://localhost:3000/api/v1
# docs   http://localhost:3000/api/v1/docs
```

Ou só o frontend, com a API já rodando em `localhost:3000`:

```bash
cd frontend
npm install
npm start          # http://localhost:4200
```

O dev-server faz proxy de `/api` para a API (`proxy.conf.js`); `API_URL` troca o
destino sem editar arquivo.

Build de produção:

```bash
npm run build      # dist/discricionario/browser
```

---

## Como a aplicação está organizada

```text
src/app/
├── core/                    uma instância, carregado no bootstrap
│   ├── auth/                auth.service · guards (authGuard, perfilGuard)
│   ├── http/                api.service · interceptors · services de domínio
│   ├── ciclo/               ciclo.store — o ano selecionado, global
│   ├── auditoria/           eventos de tela → POST /audit
│   └── models/              tipos espelhando os DTOs da API
│
├── shared/
│   ├── pipes/               moeda · fator · pontosPercentuais · variacao · celula
│   └── componentes/
│       ├── tabela-participantes/    mat-table montada pelo layout do comitê
│       ├── personalizar-comite/     campos do painel + colunas da tabela
│       ├── painel-discricionario/   o único ponto que grava decisão
│       ├── bloco-graficos/          RV · TC · TC + P.Sócios num gráfico só
│       └── medidor-pool/            disponível · consumido · saldo
│
├── features/
│   ├── autenticacao/        login
│   ├── painel/              KPIs do ciclo e lista de comitês
│   ├── comites/
│   │   ├── lista/
│   │   ├── montagem/            stepper: dados › participantes › campos › responsáveis
│   │   └── comite-pagina/       abas Comitê · Pool · ATA
│   │       └── partes/          resumo-nivel · aba-ata
│   ├── consolidacao/        comparativo · nominais · controle de grupos
│   ├── cargas/              prévia · processamento · histórico · erros
│   └── administracao/       ciclos · motivadores · usuários · auditoria
│
└── layout/                  shell: toolbar + sidenav + seletor de ciclo
```

---

## As quatro decisões que sustentam o resto

### O ciclo é global e implícito

`CicloStore` guarda o ano selecionado num signal, persistido em `localStorage`.
O `cicloInterceptor` injeta `?ciclo=` em toda requisição, então nenhuma tela
precisa lembrar de passar o ano — e trocar o ciclo na toolbar troca a safra
inteira. Rodar 2027 não apaga 2026: é o mesmo app, outro `?ciclo=`.
Ciclo fechado deixa as telas em modo leitura (`somenteLeitura`).

### Nenhuma conta no frontend

O `painel-discricionario` mostra uma projeção enquanto o slider se move, e diz
isso na tela. O valor que vale é o que a API devolve depois do `PATCH` — por isso
tela e relatório nunca divergem por um centavo de arredondamento.

### O erro da API já vem pronto para a tela

O contrato é `{ statusCode, message, error, codigo, detalhes }`. O
`erroInterceptor` deixa passar os códigos que a tela sabe tratar
(`POOL_EXCEDIDO`, `FD_FORA_DO_LIMITE`, `PARTICIPANTE_JA_ALOCADO`…) para o
componente mostrar o número junto, e manda o resto para o snackbar.
Use sempre `mensagemDoErro(erroApiDe(falha))`: `message` pode vir como array
quando é o `ValidationPipe` reclamando de vários campos.

### O layout do comitê tem dois contextos

`GET /comites/:id/colunas` devolve `{ tabela, painel }`. São listas independentes
sobre o mesmo catálogo de 49 campos: as colunas da tabela e os campos de valor do
painel de análise. O Atendimento monta; a consultoria abre pronto.

---

## A tela do comitê

Uma tela só, na ordem em que a reunião trabalha:

1. **Resumo por nível de cargo** em cima — HC, HC Máx (teto de 1/3), aumentos,
   reduções e a checagem OK/REVER por nível × modelo.
2. **No meio**: o fator discricionário à esquerda; à direita, a performance
   ponderada em cima e o bloco de gráficos embaixo.
3. **A tabela** embaixo — é por ela que se navega entre as pessoas.

**Pool** e **ATA** são abas: conferência, não decisão.

Depois de cada `PATCH` bem-sucedido, `/resumo` e `/pool` são recarregados em
paralelo, então HC com discricionário, checagem e saldo refletem na hora a
decisão que acabou de ser tomada.

---

## Gráficos

RV, Total Cash e TC + P. Sócios são três séries em reais na mesma escala, então
cabem no mesmo eixo — é isso que deixa ler a estratificação da remuneração de
uma vez. Desenhado em SVG puro (no máximo quatro pontos por série), seguindo os
tokens de tema, o que faz claro e escuro funcionarem sem configuração.

As cores das séries são `--serie-rv`, `--serie-tc` e `--serie-tcs`, em
`styles.scss`. Foram escolhidas com validação de contraste e de separação para
daltonismo (deuteranopia, protanopia e tritanopia) — trocar uma delas sem
revalidar pode tornar duas linhas indistinguíveis.

O eixo é truncado de propósito: com piso em zero, uma variação de 15% no PR vira
uma inclinação imperceptível. Os rótulos da grade nomeiam o menor e o maior valor
que as séries realmente alcançam.

---

## Perfis

| Ação | ADMIN | ATENDIMENTO | CONSULTORIA |
| ---- | :---: | :---------: | :---------: |
| Ver e lançar discricionário nos comitês do seu escopo | ✅ | ✅ | ✅ |
| Montar comitê, escolher participantes e layout | ✅ | ✅ | — |
| Concluir comitê | ✅ | ✅ | ✅ |
| Reabrir comitê | ✅ | ✅ | — |
| Cargas, ciclos, motivadores e usuários | ✅ | — | — |

O `perfilGuard` só evita que o usuário caia numa tela que a API recusaria.
A visibilidade real é garantida no banco: a consultora só enxerga os comitês em
que está cadastrada, e um comitê fora do escopo responde 404.

---

## Convenções

- **Standalone components** em tudo, `inject()` no lugar de constructor injection.
- **Signals** para estado; `computed()` para derivado. Sem NgRx — o estado global
  aqui é pequeno (ciclo, usuário, comitê aberto).
- **`OnPush`** em todos os componentes.
- **Controle de fluxo novo**: `@if`, `@for` com `track`, `@empty`, `@switch`.
  Nada de `*ngIf`/`*ngFor`.
- **`strict: true` e `strictTemplates: true`**. `any` é proibido; `$any()` em
  template é a única exceção.
- Texto de interface em português. Comentário só quando explica **por quê**.

---

## Estado da verificação

O ambiente onde este código foi escrito não tinha acesso ao registro npm, então
**não houve `ng build`**. O que foi verificado estaticamente, com o compilador
TypeScript: sintaxe dos 36 arquivos TS, resolução de todos os imports relativos e
dos nomes exportados, existência de cada `templateUrl`/`styleUrl`, e presença no
array `imports` de cada componente e pipe usado nos 21 templates.

O primeiro `npm install && ng build` na sua máquina é o teste que falta.
