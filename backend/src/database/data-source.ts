import { config as carregarDotenv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';

// Fora do Docker (CLI de migration/seed) as variáveis vêm do .env da raiz.
carregarDotenv({ path: join(process.cwd(), '.env') });
carregarDotenv({ path: join(process.cwd(), '..', '.env') });

const raiz = join(__dirname, '..');

export const opcoesDataSource: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? 'discretionary',
  username: process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'postgres',
  // Nunca usamos `synchronize`: o schema é sempre criado por migration.
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
  entities: [join(raiz, '**', '*.entity{.ts,.js}')],
  migrations: [join(raiz, 'database', 'migrations', '*{.ts,.js}')],
  migrationsTableName: 'migrations_historico',
};

/** DataSource usado pela CLI do TypeORM (`npm run migration:run`). */
export const AppDataSource = new DataSource(opcoesDataSource);

export default AppDataSource;
