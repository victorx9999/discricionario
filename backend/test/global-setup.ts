import { config as carregarDotenv } from 'dotenv';
import { join } from 'node:path';
import { Client } from 'pg';

/**
 * Cria o banco de testes antes da suíte, se ele ainda não existir.
 * O schema em si é criado pelas migrations, na subida da aplicação.
 */
export default async function globalSetup(): Promise<void> {
  carregarDotenv({ path: join(__dirname, '..', '.env') });
  carregarDotenv({ path: join(__dirname, '..', '..', '.env') });

  const nomeBanco = process.env.TEST_DATABASE_NAME ?? 'discretionary_test';

  const cliente = new Client({
    host: process.env.TEST_DATABASE_HOST ?? process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.TEST_DATABASE_PORT ?? process.env.DATABASE_PORT ?? 5432),
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    database: 'postgres',
  });

  await cliente.connect();
  try {
    const existente = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nomeBanco]);
    if (!existente.rowCount) {
      await cliente.query(`CREATE DATABASE "${nomeBanco}"`);
    }
  } finally {
    await cliente.end();
  }
}
