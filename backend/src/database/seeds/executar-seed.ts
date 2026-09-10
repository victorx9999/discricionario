import { Logger } from '@nestjs/common';
import { AppDataSource } from '../data-source';
import { SeedService } from './seed.service';

/**
 * Executa o seed pela CLI.
 *
 *   npm run seed            -> popula sem apagar o que já existe
 *   npm run seed:reset      -> limpa as tabelas antes de popular
 *   npm run seed -- --qtd=5000
 */
async function principal(): Promise<void> {
  const logger = new Logger('ExecutarSeed');
  const argumentos = process.argv.slice(2);

  const reset = argumentos.includes('--reset');
  const argumentoQuantidade = argumentos.find((argumento) => argumento.startsWith('--qtd='));
  const quantidadeParticipantes = argumentoQuantidade
    ? Number(argumentoQuantidade.split('=')[1])
    : Number(process.env.SEED_QTD_PARTICIPANTES ?? 1500);

  await AppDataSource.initialize();

  try {
    // Garante que o schema existe antes de popular.
    await AppDataSource.runMigrations();

    await new SeedService(AppDataSource).executar({
      reset,
      quantidadeParticipantes,
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
