import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quem monta o comitê decide se a consultoria vê os gráficos de RV / Total
 * Cash / TC + P. Sócios de cada participante na tela de avaliação.
 * Todo comitê já existente nasce com o gráfico ligado (comportamento atual).
 */
export class ExibirGraficosComite1758400000000 implements MigrationInterface {
  name = 'ExibirGraficosComite1758400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comites"
      ADD COLUMN "exibir_graficos" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comites" DROP COLUMN "exibir_graficos"`);
  }
}
