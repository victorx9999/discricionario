import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { ConfiguracaoApp } from '../config/configuracao';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const banco = config.get<ConfiguracaoApp['banco']>('banco');
        const raiz = join(__dirname, '..');

        return {
          type: 'postgres' as const,
          host: banco.host,
          port: banco.porta,
          database: banco.nome,
          username: banco.usuario,
          password: banco.senha,
          logging: banco.logging,
          // O schema é sempre criado por migration — nunca por synchronize.
          synchronize: false,
          autoLoadEntities: true,
          entities: [join(raiz, '**', '*.entity{.ts,.js}')],
          migrations: [join(raiz, 'database', 'migrations', '*{.ts,.js}')],
          migrationsTableName: 'migrations_historico',
          migrationsRun: banco.executarMigrations,
          retryAttempts: 10,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
