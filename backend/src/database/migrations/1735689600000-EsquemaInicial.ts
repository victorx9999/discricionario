import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial do sistema de Discricionário de Remuneração.
 *
 * Cadeia de relacionamentos:
 *   Grupo -> Participantes -> Comitê -> Análise do participante -> Discricionário
 */
export class EsquemaInicial1735689600000 implements MigrationInterface {
  name = 'EsquemaInicial1735689600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ------------------------------------------------------------------
    // Tipos enumerados
    // ------------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "perfil_usuario_enum" AS ENUM ('ADMIN', 'ATENDIMENTO', 'CONSULTORIA')`,
    );
    await queryRunner.query(`CREATE TYPE "status_grupo_enum" AS ENUM ('ATIVO', 'INATIVO', 'ARQUIVADO')`);
    await queryRunner.query(
      `CREATE TYPE "papel_responsavel_enum" AS ENUM ('CONSULTORA', 'BACKUP', 'CRIADOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE "status_comite_enum" AS ENUM ('RASCUNHO', 'EM_ANDAMENTO', 'FINALIZADO', 'APROVADO', 'CANCELADO')`,
    );
    await queryRunner.query(
      `CREATE TYPE "status_analise_enum" AS ENUM ('PENDENTE', 'EM_ANALISE', 'ANALISADO')`,
    );
    await queryRunner.query(`CREATE TYPE "tipo_base_enum" AS ENUM ('PRINCIPAL', 'ACRESCIMO')`);
    await queryRunner.query(`CREATE TYPE "modo_processamento_enum" AS ENUM ('COMPLETO', 'INCREMENTAL')`);
    await queryRunner.query(
      `CREATE TYPE "status_importacao_enum" AS ENUM ('PROCESSANDO', 'CONCLUIDO', 'CONCLUIDO_COM_ERROS', 'FALHOU')`,
    );
    await queryRunner.query(`CREATE TYPE "origem_auditoria_enum" AS ENUM ('BACKEND', 'FRONTEND')`);
    await queryRunner.query(`CREATE TYPE "acao_auditoria_enum" AS ENUM (
      'LOGIN', 'LOGOUT', 'LOGIN_FALHOU',
      'UPLOAD_INICIADO', 'UPLOAD_CONCLUIDO', 'UPLOAD_FALHOU',
      'GRUPO_CRIADO', 'GRUPO_ALTERADO', 'GRUPO_EXCLUIDO',
      'PARTICIPANTE_INCLUIDO', 'PARTICIPANTE_REMOVIDO', 'PARTICIPANTE_ATUALIZADO',
      'COMITE_CRIADO', 'COMITE_ALTERADO', 'COMITE_EXCLUIDO', 'COMITE_APROVADO', 'COMITE_FINALIZADO',
      'DISCRICIONARIO_CRIADO', 'DISCRICIONARIO_ALTERADO', 'DISCRICIONARIO_REMOVIDO',
      'JUSTIFICATIVA_ALTERADA', 'AVALIACAO_COMPORTAMENTAL_ALTERADA', 'ANALISE_ATUALIZADA',
      'FILTRO_APLICADO', 'CONSULTA_REALIZADA', 'ERRO_PROCESSAMENTO', 'ACAO_FRONTEND'
    )`);

    // ------------------------------------------------------------------
    // usuarios
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nome" character varying(150) NOT NULL,
        "email" character varying(150) NOT NULL,
        "senha_hash" character varying(255) NOT NULL,
        "perfil" "perfil_usuario_enum" NOT NULL DEFAULT 'CONSULTORIA',
        "ativo" boolean NOT NULL DEFAULT true,
        "ultimo_acesso_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "uq_usuarios_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_usuarios_email" ON "usuarios" ("email")`);

    // ------------------------------------------------------------------
    // importacoes / erros_importacao
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "importacoes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tipo_base" "tipo_base_enum" NOT NULL,
        "modo" "modo_processamento_enum" NOT NULL DEFAULT 'INCREMENTAL',
        "nome_arquivo" character varying(255) NOT NULL,
        "tamanho_bytes" bigint NOT NULL DEFAULT 0,
        "status" "status_importacao_enum" NOT NULL DEFAULT 'PROCESSANDO',
        "total_registros" integer NOT NULL DEFAULT 0,
        "registros_processados" integer NOT NULL DEFAULT 0,
        "registros_inseridos" integer NOT NULL DEFAULT 0,
        "registros_atualizados" integer NOT NULL DEFAULT 0,
        "registros_removidos" integer NOT NULL DEFAULT 0,
        "registros_com_erro" integer NOT NULL DEFAULT 0,
        "mensagem_erro" text,
        "resumo" jsonb,
        "executado_por_id" uuid,
        "finalizado_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_importacoes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_importacoes_usuario" FOREIGN KEY ("executado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_importacoes_criado_em" ON "importacoes" ("criado_em")`);

    await queryRunner.query(`
      CREATE TABLE "erros_importacao" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "importacao_id" uuid NOT NULL,
        "linha" integer NOT NULL,
        "coluna" character varying(80),
        "valor" character varying(255),
        "mensagem" character varying(500) NOT NULL,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_erros_importacao" PRIMARY KEY ("id"),
        CONSTRAINT "fk_erros_importacao" FOREIGN KEY ("importacao_id")
          REFERENCES "importacoes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_erros_importacao" ON "erros_importacao" ("importacao_id")`);

    // ------------------------------------------------------------------
    // participantes
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "participantes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "funcional" character varying(30) NOT NULL,
        "nome" character varying(200) NOT NULL,
        "cargo" character varying(150),
        "nivel_cargo" character varying(80),
        "modelo_avaliacao" character varying(80),
        "area" character varying(150),
        "area_origem" character varying(150),
        "fpi" numeric(12,6) NOT NULL DEFAULT 0,
        "fpi_final" numeric(12,6) NOT NULL DEFAULT 0,
        "fbpa" numeric(12,6) NOT NULL DEFAULT 0,
        "fd" numeric(12,6) NOT NULL DEFAULT 0,
        "valor_base" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_pr_i" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_pr_f" numeric(18,2) NOT NULL DEFAULT 0,
        "vlr_teorico" numeric(18,2) NOT NULL DEFAULT 0,
        "ativo" boolean NOT NULL DEFAULT true,
        "importacao_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_participantes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_participantes_funcional" UNIQUE ("funcional")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_participantes_funcional" ON "participantes" ("funcional")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_participantes_nome" ON "participantes" ("nome")`);
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_nivel_cargo" ON "participantes" ("nivel_cargo")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_participantes_area" ON "participantes" ("area")`);
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_modelo_avaliacao" ON "participantes" ("modelo_avaliacao")`,
    );
    // Busca textual case-insensitive por nome (usada em ILIKE '%termo%')
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_nome_lower" ON "participantes" (LOWER("nome"))`,
    );

    // ------------------------------------------------------------------
    // acrescimos_participante
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "acrescimos_participante" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "participante_id" uuid NOT NULL,
        "area_origem" character varying(150) NOT NULL,
        "valor_acrescimo_pr_i" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_acrescimo_pr_f" numeric(18,2) NOT NULL DEFAULT 0,
        "observacao" character varying(300),
        "importacao_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_acrescimos_participante" PRIMARY KEY ("id"),
        CONSTRAINT "uq_acrescimo_participante_area" UNIQUE ("participante_id", "area_origem"),
        CONSTRAINT "fk_acrescimos_participante" FOREIGN KEY ("participante_id")
          REFERENCES "participantes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_acrescimos_participante" ON "acrescimos_participante" ("participante_id")`,
    );

    // ------------------------------------------------------------------
    // grupos / grupo_responsaveis / grupo_participantes
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "grupos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nome" character varying(150) NOT NULL,
        "codigo" character varying(50) NOT NULL,
        "status" "status_grupo_enum" NOT NULL DEFAULT 'ATIVO',
        "descricao" character varying(400),
        "criado_por_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_grupos" PRIMARY KEY ("id"),
        CONSTRAINT "uq_grupos_codigo" UNIQUE ("codigo"),
        CONSTRAINT "fk_grupos_criado_por" FOREIGN KEY ("criado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_grupos_codigo" ON "grupos" ("codigo")`);
    await queryRunner.query(`CREATE INDEX "idx_grupos_nome" ON "grupos" ("nome")`);

    await queryRunner.query(`
      CREATE TABLE "grupo_responsaveis" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "grupo_id" uuid NOT NULL,
        "usuario_id" uuid NOT NULL,
        "papel" "papel_responsavel_enum" NOT NULL,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_grupo_responsaveis" PRIMARY KEY ("id"),
        CONSTRAINT "uq_grupo_responsavel" UNIQUE ("grupo_id", "usuario_id", "papel"),
        CONSTRAINT "fk_grupo_responsaveis_grupo" FOREIGN KEY ("grupo_id")
          REFERENCES "grupos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_grupo_responsaveis_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "grupo_participantes" (
        "grupo_id" uuid NOT NULL,
        "participante_id" uuid NOT NULL,
        CONSTRAINT "pk_grupo_participantes" PRIMARY KEY ("grupo_id", "participante_id"),
        CONSTRAINT "fk_grupo_participantes_grupo" FOREIGN KEY ("grupo_id")
          REFERENCES "grupos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_grupo_participantes_participante" FOREIGN KEY ("participante_id")
          REFERENCES "participantes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_grupo_participantes_grupo" ON "grupo_participantes" ("grupo_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_grupo_participantes_participante" ON "grupo_participantes" ("participante_id")`,
    );

    // ------------------------------------------------------------------
    // comites / analises_participante
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "comites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nome" character varying(150) NOT NULL,
        "codigo" character varying(50) NOT NULL,
        "grupo_id" uuid NOT NULL,
        "status" "status_comite_enum" NOT NULL DEFAULT 'RASCUNHO',
        "descricao" character varying(400),
        "criado_por_id" uuid,
        "finalizado_em" TIMESTAMP WITH TIME ZONE,
        "aprovado_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_comites" PRIMARY KEY ("id"),
        CONSTRAINT "uq_comites_codigo" UNIQUE ("codigo"),
        CONSTRAINT "fk_comites_grupo" FOREIGN KEY ("grupo_id")
          REFERENCES "grupos"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_comites_criado_por" FOREIGN KEY ("criado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_comites_codigo" ON "comites" ("codigo")`);
    await queryRunner.query(`CREATE INDEX "idx_comites_nome" ON "comites" ("nome")`);
    await queryRunner.query(`CREATE INDEX "idx_comites_grupo" ON "comites" ("grupo_id")`);

    await queryRunner.query(`
      CREATE TABLE "analises_participante" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "comite_id" uuid NOT NULL,
        "participante_id" uuid NOT NULL,
        "ordem" integer NOT NULL DEFAULT 1,
        "status" "status_analise_enum" NOT NULL DEFAULT 'PENDENTE',
        "analisado_por_id" uuid,
        "analisado_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_analises_participante" PRIMARY KEY ("id"),
        CONSTRAINT "uq_analise_comite_participante" UNIQUE ("comite_id", "participante_id"),
        CONSTRAINT "fk_analises_comite" FOREIGN KEY ("comite_id")
          REFERENCES "comites"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_analises_participante" FOREIGN KEY ("participante_id")
          REFERENCES "participantes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_analises_analisado_por" FOREIGN KEY ("analisado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_analises_comite_ordem" ON "analises_participante" ("comite_id", "ordem")`,
    );

    // ------------------------------------------------------------------
    // avaliacoes_comportamentais / discricionarios
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "avaliacoes_comportamentais" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" character varying(40) NOT NULL,
        "nome" character varying(120) NOT NULL,
        "descricao" character varying(300),
        "ordem" integer NOT NULL DEFAULT 0,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_avaliacoes_comportamentais" PRIMARY KEY ("id"),
        CONSTRAINT "uq_avaliacoes_comportamentais_codigo" UNIQUE ("codigo")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "discricionarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "analise_id" uuid NOT NULL,
        "valor_fd" numeric(12,6) NOT NULL DEFAULT 0,
        "avaliacao_comportamental_id" uuid,
        "justificativa" text,
        "fpi_final_calculado" numeric(12,6) NOT NULL DEFAULT 0,
        "valor_pr_i_calculado" numeric(18,2) NOT NULL DEFAULT 0,
        "valor_pr_f_calculado" numeric(18,2) NOT NULL DEFAULT 0,
        "impacto_financeiro" numeric(18,2) NOT NULL DEFAULT 0,
        "criado_por_id" uuid,
        "atualizado_por_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_discricionarios" PRIMARY KEY ("id"),
        CONSTRAINT "uq_discricionarios_analise" UNIQUE ("analise_id"),
        CONSTRAINT "ck_discricionarios_limite" CHECK ("valor_fd" >= -0.15 AND "valor_fd" <= 0.15),
        CONSTRAINT "fk_discricionarios_analise" FOREIGN KEY ("analise_id")
          REFERENCES "analises_participante"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_discricionarios_avaliacao" FOREIGN KEY ("avaliacao_comportamental_id")
          REFERENCES "avaliacoes_comportamentais"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_discricionarios_criado_por" FOREIGN KEY ("criado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_discricionarios_atualizado_por" FOREIGN KEY ("atualizado_por_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_discricionarios_analise" ON "discricionarios" ("analise_id")`,
    );

    // ------------------------------------------------------------------
    // auditoria_logs
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "auditoria_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acao" "acao_auditoria_enum" NOT NULL,
        "entidade" character varying(60) NOT NULL,
        "entidade_id" character varying(100),
        "usuario_id" uuid,
        "usuario_email" character varying(150),
        "comite_id" uuid,
        "participante_id" uuid,
        "campo_alterado" character varying(80),
        "valor_anterior" text,
        "valor_novo" text,
        "justificativa" text,
        "detalhes" jsonb,
        "origem" "origem_auditoria_enum" NOT NULL DEFAULT 'BACKEND',
        "ip" character varying(64),
        "user_agent" character varying(300),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auditoria_logs" PRIMARY KEY ("id"),
        CONSTRAINT "fk_auditoria_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_criado_em" ON "auditoria_logs" ("criado_em")`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_acao" ON "auditoria_logs" ("acao")`);
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_entidade" ON "auditoria_logs" ("entidade", "entidade_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_auditoria_usuario" ON "auditoria_logs" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_comite" ON "auditoria_logs" ("comite_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_participante" ON "auditoria_logs" ("participante_id")`,
    );

    // ------------------------------------------------------------------
    // Dados de domínio obrigatórios (não são dados fictícios de seed)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "avaliacoes_comportamentais" ("codigo", "nome", "descricao", "ordem") VALUES
        ('SQV', 'SQV', 'Avaliação SQV', 1),
        ('TODOS', 'Todos', 'Aplicável a todos os critérios', 2),
        ('PERFORMANCE', 'Performance', 'Avaliação por performance', 3),
        ('A_DEFINIR', 'A definir', 'Placeholder da quarta opção — renomeie o registro quando o nome for confirmado', 4)
      ON CONFLICT ("codigo") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discricionarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "avaliacoes_comportamentais"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "analises_participante"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "grupo_participantes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "grupo_responsaveis"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "grupos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acrescimos_participante"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "participantes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "erros_importacao"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "importacoes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "acao_auditoria_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "origem_auditoria_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_importacao_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "modo_processamento_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tipo_base_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_analise_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_comite_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "papel_responsavel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_grupo_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "perfil_usuario_enum"`);
  }
}
