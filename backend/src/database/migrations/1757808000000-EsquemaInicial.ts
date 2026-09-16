import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial do Discricionário de Remuneração.
 *
 * Estrutura por ciclo (ano-base):
 *   Ciclo -> Participantes / Acréscimos / Comitês -> ATA -> Discricionário (no participante)
 *
 * Todas as tabelas de dados carregam `ciclo_id`, o que mantém cada ano
 * isolado: a carga completa de 2027 nunca toca em 2026.
 */
export class EsquemaInicial1757808000000 implements MigrationInterface {
  name = 'EsquemaInicial1757808000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ------------------------------------------------------------------
    // Tipos enumerados
    // ------------------------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "perfil_usuario_enum" AS ENUM ('ADMIN', 'ATENDIMENTO', 'CONSULTORIA')`,
    );
    await queryRunner.query(`CREATE TYPE "status_ciclo_enum" AS ENUM ('ABERTO', 'FECHADO')`);
    await queryRunner.query(`CREATE TYPE "status_comite_enum" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO')`);
    await queryRunner.query(
      `CREATE TYPE "tipo_comite_enum" AS ENUM ('Institucional', 'Comunidade', 'Misto')`,
    );
    await queryRunner.query(
      `CREATE TYPE "papel_responsavel_enum" AS ENUM ('CONSULTORIA', 'BACKUP', 'CRIADOR')`,
    );
    await queryRunner.query(`CREATE TYPE "tipo_base_enum" AS ENUM ('PRINCIPAL', 'ACRESCIMO')`);
    await queryRunner.query(`CREATE TYPE "modo_carga_enum" AS ENUM ('COMPLETA', 'PARCIAL')`);
    await queryRunner.query(
      `CREATE TYPE "status_importacao_enum" AS ENUM ('PROCESSANDO', 'CONCLUIDO', 'CONCLUIDO_COM_ERROS', 'FALHOU')`,
    );
    await queryRunner.query(`CREATE TYPE "origem_auditoria_enum" AS ENUM ('BACKEND', 'FRONTEND')`);
    await queryRunner.query(
      `CREATE TYPE "operacao_auditoria_enum" AS ENUM ('INSERT', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'ERRO')`,
    );
    await queryRunner.query(`CREATE TYPE "acao_auditoria_enum" AS ENUM (
      'LOGIN', 'LOGOUT', 'LOGIN_FALHOU',
      'CICLO_CRIADO', 'CICLO_ATIVADO', 'CICLO_FECHADO', 'CICLO_REABERTO', 'PREMISSA_ALTERADA',
      'UPLOAD_INICIADO', 'UPLOAD_CONCLUIDO', 'UPLOAD_FALHOU',
      'COMITE_CRIADO', 'COMITE_ALTERADO', 'COMITE_CONCLUIDO', 'COMITE_REABERTO',
      'COMITE_REMOVIDO', 'COMITE_RESTAURADO', 'COLUNAS_ALTERADAS',
      'PARTICIPANTE_VINCULADO', 'PARTICIPANTE_DESVINCULADO', 'PARTICIPANTE_CRIADO', 'PARTICIPANTE_ALTERADO',
      'DISCRICIONARIO_LANCADO', 'DISCRICIONARIO_ALTERADO', 'DISCRICIONARIO_ZERADO',
      'DISCRICIONARIO_FORA_LIMITE', 'MOTIVADOR_ALTERADO', 'JUSTIFICATIVA_ALTERADA',
      'ATA_CADASTRADA', 'ATA_ALTERADA',
      'MOTIVO_CRIADO', 'MOTIVO_ALTERADO', 'MOTIVO_REMOVIDO',
      'USUARIO_CRIADO', 'USUARIO_ALTERADO',
      'FILTRO_APLICADO', 'CONSULTA_REALIZADA', 'ERRO_PROCESSAMENTO', 'ACAO_FRONTEND'
    )`);

    // ------------------------------------------------------------------
    // ciclos — raiz do histórico e das premissas vigentes
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ciclos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ano" integer NOT NULL,
        "descricao" character varying(120),
        "status" "status_ciclo_enum" NOT NULL DEFAULT 'ABERTO',
        "ativo" boolean NOT NULL DEFAULT false,
        "percentual_pool" numeric(8,6) NOT NULL DEFAULT 0.01,
        "limite_fd" numeric(8,6) NOT NULL DEFAULT 0.15,
        "bloquear_pool_excedido" boolean NOT NULL DEFAULT true,
        "divisor_hc_max" integer NOT NULL DEFAULT 3,
        "fator_pep" numeric(8,6) NOT NULL DEFAULT 0.725,
        "fator_diferimento" numeric(8,6) NOT NULL DEFAULT 0.70,
        "tipo_simulador_performance" character varying(40) NOT NULL DEFAULT 'Institucional',
        "motivo_obrigatorio" boolean NOT NULL DEFAULT true,
        "ata_obrigatoria" boolean NOT NULL DEFAULT true,
        "fechado_em" TIMESTAMP WITH TIME ZONE,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_ciclos" PRIMARY KEY ("id"),
        CONSTRAINT "uq_ciclos_ano" UNIQUE ("ano")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_ciclos_ano" ON "ciclos" ("ano")`);
    // Garante que exista no máximo um ciclo ativo.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_ciclos_unico_ativo" ON "ciclos" ("ativo") WHERE "ativo" = true`,
    );

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
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "uq_usuarios_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_usuarios_email" ON "usuarios" ("email")`);

    // ------------------------------------------------------------------
    // motivos — catálogo de motivadores (COD_MOTIVADOR)
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "motivos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" integer NOT NULL,
        "descricao" character varying(200) NOT NULL,
        "detalhe" character varying(400),
        "limite_fd" numeric(8,6),
        "exige_justificativa" boolean NOT NULL DEFAULT true,
        "ordem" integer NOT NULL DEFAULT 0,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_motivos" PRIMARY KEY ("id"),
        CONSTRAINT "uq_motivos_codigo" UNIQUE ("codigo")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_motivos_codigo" ON "motivos" ("codigo")`);

    // ------------------------------------------------------------------
    // comites — o GRUPO_RANKING
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "comites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ciclo_id" uuid NOT NULL,
        "codigo" character varying(50) NOT NULL,
        "nome" character varying(150) NOT NULL,
        "grupo_ranking" character varying(200) NOT NULL,
        "area" character varying(150),
        "tipo" "tipo_comite_enum" NOT NULL DEFAULT 'Misto',
        "status" "status_comite_enum" NOT NULL DEFAULT 'EM_ANDAMENTO',
        "descricao" character varying(400),
        "concluido_com_pool_excedido" boolean NOT NULL DEFAULT false,
        "concluido_em" TIMESTAMP WITH TIME ZONE,
        "concluido_por_id" uuid,
        "criado_por_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_comites" PRIMARY KEY ("id"),
        CONSTRAINT "uq_comite_ciclo_codigo" UNIQUE ("ciclo_id", "codigo"),
        CONSTRAINT "fk_comites_ciclo" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_comites_criado_por" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_comites_concluido_por" FOREIGN KEY ("concluido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_comites_ciclo" ON "comites" ("ciclo_id")`);
    await queryRunner.query(`CREATE INDEX "idx_comites_nome" ON "comites" ("nome")`);
    await queryRunner.query(`CREATE INDEX "idx_comites_grupo_ranking" ON "comites" ("grupo_ranking")`);
    await queryRunner.query(`CREATE INDEX "idx_comites_criado_por" ON "comites" ("criado_por_id")`);

    await queryRunner.query(`
      CREATE TABLE "comite_responsaveis" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "comite_id" uuid NOT NULL,
        "usuario_id" uuid NOT NULL,
        "papel" "papel_responsavel_enum" NOT NULL,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_comite_responsaveis" PRIMARY KEY ("id"),
        CONSTRAINT "uq_comite_responsavel" UNIQUE ("comite_id", "usuario_id", "papel"),
        CONSTRAINT "fk_comite_responsaveis_comite" FOREIGN KEY ("comite_id") REFERENCES "comites"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_comite_responsaveis_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_comite_responsaveis_comite" ON "comite_responsaveis" ("comite_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_comite_responsaveis_usuario" ON "comite_responsaveis" ("usuario_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "comite_colunas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "comite_id" uuid NOT NULL,
        "chave" character varying(60) NOT NULL,
        "visivel" boolean NOT NULL DEFAULT true,
        "ordem" integer NOT NULL DEFAULT 0,
        "largura" integer,
        "fixa" boolean NOT NULL DEFAULT false,
        "rotulo" character varying(80),
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_comite_colunas" PRIMARY KEY ("id"),
        CONSTRAINT "uq_comite_coluna" UNIQUE ("comite_id", "chave"),
        CONSTRAINT "fk_comite_colunas_comite" FOREIGN KEY ("comite_id") REFERENCES "comites"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_comite_colunas_comite" ON "comite_colunas" ("comite_id")`,
    );

    // ------------------------------------------------------------------
    // atas
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "atas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "comite_id" uuid NOT NULL,
        "data" date,
        "hora_inicio" time,
        "hora_fim" time,
        "observacoes" text,
        "anexos" jsonb,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_atas" PRIMARY KEY ("id"),
        CONSTRAINT "fk_atas_comite" FOREIGN KEY ("comite_id") REFERENCES "comites"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_atas_comite" ON "atas" ("comite_id")`);

    await queryRunner.query(`
      CREATE TABLE "ata_participantes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ata_id" uuid NOT NULL,
        "nome" character varying(150) NOT NULL,
        "papel" character varying(120),
        "usuario_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ata_participantes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_ata_participantes_ata" FOREIGN KEY ("ata_id") REFERENCES "atas"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ata_participantes_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_ata_participantes_ata" ON "ata_participantes" ("ata_id")`,
    );

    // ------------------------------------------------------------------
    // importacoes / erros_importacao
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "importacoes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ciclo_id" uuid NOT NULL,
        "tipo_base" "tipo_base_enum" NOT NULL,
        "modo" "modo_carga_enum" NOT NULL DEFAULT 'PARCIAL',
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
        CONSTRAINT "fk_importacoes_ciclo" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_importacoes_usuario" FOREIGN KEY ("executado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_importacoes_ciclo" ON "importacoes" ("ciclo_id")`);
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
        CONSTRAINT "fk_erros_importacao" FOREIGN KEY ("importacao_id") REFERENCES "importacoes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_erros_importacao" ON "erros_importacao" ("importacao_id")`,
    );

    // ------------------------------------------------------------------
    // participantes — TBPR_Simuladores + decisão do comitê
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "participantes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ciclo_id" uuid NOT NULL,
        "comite_id" uuid,

        "national_id" character varying(30),
        "emplid" character varying(30) NOT NULL,
        "nome" character varying(200) NOT NULL,
        "dtuflpg" date,
        "last_hire_dt" date,
        "company" character varying(20),
        "descr_company" character varying(150),
        "jobcode" character varying(30),
        "descr_jobcode" character varying(150),
        "manager_level" integer,
        "xlatlongname" character varying(80),
        "deptid" character varying(30),
        "descr_deptid" character varying(150),
        "area" character varying(150),
        "area_origem" character varying(150),
        "idsubmodelo" character varying(30),
        "descricao_submodelo" character varying(150),

        "valorbase" numeric(18,2) NOT NULL DEFAULT 0,
        "vlbasemes" numeric(18,2) NOT NULL DEFAULT 0,
        "elegivel" numeric(12,4) NOT NULL DEFAULT 0,
        "eleg_total" numeric(12,4) NOT NULL DEFAULT 0,
        "fpba" numeric(12,6) NOT NULL DEFAULT 0,
        "nota" numeric(12,4) NOT NULL DEFAULT 0,
        "fpi" numeric(12,6) NOT NULL DEFAULT 0,
        "fd" numeric(12,6) NOT NULL DEFAULT 0,
        "calc1" numeric(18,6) NOT NULL DEFAULT 0,
        "calc2" numeric(18,6) NOT NULL DEFAULT 0,
        "calc3" numeric(18,6) NOT NULL DEFAULT 0,
        "calc4" numeric(18,6) NOT NULL DEFAULT 0,
        "grupo_ranking" character varying(150),
        "idpool" character varying(60),
        "idcurva" character varying(60),
        "vb_ano_anterior" numeric(18,2) NOT NULL DEFAULT 0,
        "pr_ano_anterior1" numeric(18,2) NOT NULL DEFAULT 0,
        "pr_ano_anterior2" numeric(18,2) NOT NULL DEFAULT 0,
        "pr_ano_anterior3" numeric(18,2) NOT NULL DEFAULT 0,
        "total_cash" numeric(18,2) NOT NULL DEFAULT 0,
        "total_cash_ano_anterior1" numeric(18,2) NOT NULL DEFAULT 0,
        "total_cash_ano_anterior2" numeric(18,2) NOT NULL DEFAULT 0,
        "total_cash_ano_anterior3" numeric(18,2) NOT NULL DEFAULT 0,
        "vl_pr_i" numeric(18,2) NOT NULL DEFAULT 0,
        "vl_pr_f" numeric(18,2) NOT NULL DEFAULT 0,
        "vlr_teorico" numeric(18,2) NOT NULL DEFAULT 0,
        "nota_ano_anterior" numeric(12,4) NOT NULL DEFAULT 0,
        "modelo_avaliacao" character varying(40),
        "flag_comunidade" character varying(20),
        "area_grupo" character varying(60),
        "nome_grupo" character varying(150),
        "status_contrato" character varying(60),
        "socio_ano_anterior" boolean NOT NULL DEFAULT false,
        "socio_ano" boolean NOT NULL DEFAULT false,

        "p1" numeric(12,6), "p2" numeric(12,6), "p3" numeric(12,6),
        "p4" numeric(12,6), "p5" numeric(12,6),
        "n1" numeric(12,4), "n2" numeric(12,4), "n3" numeric(12,4),
        "n4" numeric(12,4), "n5" numeric(12,4),

        "nota_discricionario" numeric(12,4),
        "motivo_id" uuid,
        "cod_motivador" integer,
        "motivo_discricionario" character varying(200),
        "observacao_poscomite" text,
        "fd_fora_limite" boolean NOT NULL DEFAULT false,
        "lancado_por_id" uuid,
        "lancado_em" TIMESTAMP WITH TIME ZONE,

        "importacao_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,

        CONSTRAINT "pk_participantes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_participante_ciclo_emplid" UNIQUE ("ciclo_id", "emplid"),
        CONSTRAINT "fk_participantes_ciclo" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_participantes_comite" FOREIGN KEY ("comite_id") REFERENCES "comites"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_participantes_motivo" FOREIGN KEY ("motivo_id") REFERENCES "motivos"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_participantes_lancado_por" FOREIGN KEY ("lancado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_participantes_ciclo" ON "participantes" ("ciclo_id")`);
    await queryRunner.query(`CREATE INDEX "idx_participantes_comite" ON "participantes" ("comite_id")`);
    await queryRunner.query(`CREATE INDEX "idx_participantes_emplid" ON "participantes" ("emplid")`);
    await queryRunner.query(`CREATE INDEX "idx_participantes_nome" ON "participantes" ("nome")`);
    await queryRunner.query(`CREATE INDEX "idx_participantes_nivel" ON "participantes" ("xlatlongname")`);
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_modelo" ON "participantes" ("modelo_avaliacao")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_participantes_area" ON "participantes" ("area")`);
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_grupo_ranking" ON "participantes" ("grupo_ranking")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_nome_lower" ON "participantes" (LOWER("nome"))`,
    );
    // Acelera a listagem de quem já tem discricionário lançado no comitê.
    await queryRunner.query(
      `CREATE INDEX "idx_participantes_com_disc" ON "participantes" ("comite_id") WHERE "fd" <> 0`,
    );

    // ------------------------------------------------------------------
    // acrescimos — TBPR_Simuladores_Acres
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "acrescimos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ciclo_id" uuid NOT NULL,
        "emplid" character varying(30) NOT NULL,
        "participante_id" uuid,
        "flag_calcular_pool" boolean NOT NULL DEFAULT false,
        "tipo_simulador" character varying(40),
        "idpool" character varying(60),
        "grupo_ranking" character varying(150),
        "vlr_teorico" numeric(18,2) NOT NULL DEFAULT 0,
        "vl_pr_i" numeric(18,2) NOT NULL DEFAULT 0,
        "calc4" numeric(18,6) NOT NULL DEFAULT 0,
        "fpi" numeric(12,6) NOT NULL DEFAULT 0,
        "area" character varying(150),
        "importacao_id" uuid,
        "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "removido_em" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_acrescimos" PRIMARY KEY ("id"),
        CONSTRAINT "fk_acrescimos_ciclo" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_acrescimos_participante" FOREIGN KEY ("participante_id") REFERENCES "participantes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_acrescimos_emplid" ON "acrescimos" ("ciclo_id", "emplid")`);
    await queryRunner.query(
      `CREATE INDEX "idx_acrescimos_participante" ON "acrescimos" ("participante_id")`,
    );

    // ------------------------------------------------------------------
    // auditoria_logs
    // ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "auditoria_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "acao" "acao_auditoria_enum" NOT NULL,
        "operacao" "operacao_auditoria_enum" NOT NULL DEFAULT 'UPDATE',
        "entidade" character varying(60) NOT NULL,
        "entidade_id" character varying(100),
        "ciclo_id" uuid,
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
        CONSTRAINT "fk_auditoria_ciclo" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_auditoria_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_criado_em" ON "auditoria_logs" ("criado_em")`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_acao" ON "auditoria_logs" ("acao")`);
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_entidade" ON "auditoria_logs" ("entidade", "entidade_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_auditoria_ciclo" ON "auditoria_logs" ("ciclo_id")`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_usuario" ON "auditoria_logs" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX "idx_auditoria_comite" ON "auditoria_logs" ("comite_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_auditoria_participante" ON "auditoria_logs" ("participante_id")`,
    );

    // ------------------------------------------------------------------
    // Dados de domínio obrigatórios
    // ------------------------------------------------------------------
    await queryRunner.query(`
      INSERT INTO "motivos" ("codigo", "descricao", "detalhe", "limite_fd", "ordem") VALUES
        (1, 'Performance com justificativa detalhada',
            'Ajuste por performance individual, com justificativa detalhada obrigatória.', NULL, 1),
        (2, 'Indicadores de avaliação comportamental',
            'Ajuste fundamentado nos indicadores de avaliação comportamental.', NULL, 2),
        (3, 'SQV (com impacto limitado a +/- 5pp)',
            'Ajuste por SQV. O impacto é limitado a ±5 pontos percentuais.', 0.05, 3),
        (4, 'Todos', 'Combinação dos motivadores acima.', NULL, 4)
      ON CONFLICT ("codigo") DO NOTHING
    `);

    // Ciclo inicial, já ativo, com as premissas vigentes da seção 10.
    await queryRunner.query(`
      INSERT INTO "ciclos" ("ano", "descricao", "status", "ativo")
      VALUES (2025, 'Ciclo 2025', 'ABERTO', true)
      ON CONFLICT ("ano") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auditoria_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "acrescimos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "participantes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "erros_importacao"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "importacoes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ata_participantes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "atas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comite_colunas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comite_responsaveis"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "comites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "motivos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "usuarios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ciclos"`);

    for (const tipo of [
      'acao_auditoria_enum',
      'operacao_auditoria_enum',
      'origem_auditoria_enum',
      'status_importacao_enum',
      'modo_carga_enum',
      'tipo_base_enum',
      'papel_responsavel_enum',
      'tipo_comite_enum',
      'status_comite_enum',
      'status_ciclo_enum',
      'perfil_usuario_enum',
    ]) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${tipo}"`);
    }
  }
}
