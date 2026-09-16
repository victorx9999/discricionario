import { Logger } from '@nestjs/common';
import { AppDataSource } from '../data-source';
import { SeedService } from './seed.service';

/**
 * Executa o seed pela CLI.
 *
 *   npm run seed                      -> popula 2025 (fechado) e 2026 (ativo)
 *   npm run seed:reset                -> limpa tudo antes de popular
 *   npm run seed -- --qtd=5000
 *   npm run seed -- --anos=2025,2026,2027
 */
async function principal(): Promise<void> {
  const logger = new Logger('ExecutarSeed');
  const argumentos = process.argv.slice(2);

  const valorDe = (prefixo: string): string | undefined =>
    argumentos.find((argumento) => argumento.startsWith(prefixo))?.split('=')[1];

  const reset = argumentos.includes('--reset');
  const quantidadeParticipantes = Number(
    valorDe('--qtd=') ?? process.env.SEED_QTD_PARTICIPANTES ?? 1200,
  );
  const anos = (valorDe('--anos=') ?? process.env.SEED_ANOS ?? '2025,2026')
    .split(',')
    .map((ano) => Number(ano.trim()))
    .filter((ano) => Number.isInteger(ano));

  await AppDataSource.initialize();

  try {
    await AppDataSource.runMigrations();

    await new SeedService(AppDataSource).executar({
      reset,
      quantidadeParticipantes,
      anos,
      senhaPadrao: process.env.SEED_SENHA_PADRAO ?? 'Senha@123',
    });
  } catch (erro) {
    logger.error('Falha ao executar o seed', erro instanceof Error ? erro.stack : String(erro));
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void principal();
