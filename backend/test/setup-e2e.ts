/**
 * Configuração dos testes de integração.
 *
 * Executa contra um banco SEPARADO (`discretionary_test`) para nunca
 * destruir a massa de desenvolvimento — os cenários de upload completo
 * apagam todas as tabelas.
 */
import { config as carregarDotenv } from 'dotenv';
import { join } from 'node:path';

carregarDotenv({ path: join(__dirname, '..', '.env') });
carregarDotenv({ path: join(__dirname, '..', '..', '.env') });

process.env.NODE_ENV = 'test';
process.env.DATABASE_HOST = process.env.TEST_DATABASE_HOST ?? process.env.DATABASE_HOST ?? 'localhost';
process.env.DATABASE_PORT = process.env.TEST_DATABASE_PORT ?? process.env.DATABASE_PORT ?? '5432';
process.env.DATABASE_NAME = process.env.TEST_DATABASE_NAME ?? 'discretionary_test';
process.env.DATABASE_USER = process.env.DATABASE_USER ?? 'postgres';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? 'postgres';
process.env.DATABASE_LOGGING = 'false';
process.env.DATABASE_RUN_MIGRATIONS = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste';
