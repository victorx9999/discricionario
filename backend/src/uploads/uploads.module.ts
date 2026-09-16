import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Comite } from '../comites/entities/comite.entity';
import { ConfiguracaoApp } from '../config/configuracao';
import { Acrescimo } from '../participantes/entities/acrescimo.entity';
import { Participante } from '../participantes/entities/participante.entity';
import { ErroImportacao } from './entities/erro-importacao.entity';
import { Importacao } from './entities/importacao.entity';
import { CsvService } from './services/csv.service';
import { ProcessadorAcrescimoService } from './services/processador-acrescimo.service';
import { ProcessadorPrincipalService } from './services/processador-principal.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Importacao, ErroImportacao, Participante, Acrescimo, Comite]),
    // Arquivos ficam em memória: são processados na própria requisição e
    // descartados, sem deixar resíduo em disco no container.
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.get<ConfiguracaoApp['upload']>('upload').tamanhoMaximoMb * 1024 * 1024,
        },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, CsvService, ProcessadorPrincipalService, ProcessadorAcrescimoService],
  exports: [UploadsService],
})
export class UploadsModule {}
