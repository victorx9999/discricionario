import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separa o layout do comitê em dois contextos.
 *
 * Até aqui `comite_colunas` guardava só as colunas da Tabela de Participantes.
 * A tela do comitê passou a ter também um painel de análise cujos campos de
 * valor o Atendimento escolhe — e são escolhas independentes: o mesmo campo
 * pode estar só na tabela, só no painel, nos dois ou em nenhum.
 *
 * As linhas que já existem viram TABELA, que é o que elas sempre foram, e a
 * unicidade passa a considerar o contexto.
 */
export class ContextoColunasComite1758240000000 implements MigrationInterface {
  name = 'ContextoColunasComite1758240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "contexto_coluna_enum" AS ENUM ('TABELA', 'PAINEL')
    `);

    await queryRunner.query(`
      ALTER TABLE "comite_colunas"
      ADD COLUMN "contexto" "contexto_coluna_enum" NOT NULL DEFAULT 'TABELA'
    `);

    await queryRunner.query(`
      ALTER TABLE "comite_colunas" DROP CONSTRAINT IF EXISTS "uq_comite_coluna"
    `);

    await queryRunner.query(`
      ALTER TABLE "comite_colunas"
      ADD CONSTRAINT "uq_comite_coluna" UNIQUE ("comite_id", "chave", "contexto")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_comite_colunas_contexto"
      ON "comite_colunas" ("comite_id", "contexto")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volta ao layout único: o painel é descartado e a tabela permanece.
    await queryRunner.query(`
      DELETE FROM "comite_colunas" WHERE "contexto" = 'PAINEL'
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_comite_colunas_contexto"`);

    await queryRunner.query(`
      ALTER TABLE "comite_colunas" DROP CONSTRAINT IF EXISTS "uq_comite_coluna"
    `);

    await queryRunner.query(`ALTER TABLE "comite_colunas" DROP COLUMN "contexto"`);

    await queryRunner.query(`
      ALTER TABLE "comite_colunas"
      ADD CONSTRAINT "uq_comite_coluna" UNIQUE ("comite_id", "chave")
    `);

    await queryRunner.query(`DROP TYPE "contexto_coluna_enum"`);
  }
}
