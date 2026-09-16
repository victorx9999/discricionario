import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, PerfisGuard } from './auth/guards';
import { CalculoModule } from './calculo/calculo.module';
import { CiclosModule } from './ciclos/ciclos.module';
import { HttpExcecaoFilter } from './common/filters';
import { ComitesModule } from './comites/comites.module';
import { carregarConfiguracao } from './config/configuracao';
import { ConsolidacaoModule } from './consolidacao/consolidacao.module';
import { DatabaseModule } from './database/database.module';
import { MotivosModule } from './motivos/motivos.module';
import { ParticipantesModule } from './participantes/participantes.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsuariosModule } from './usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [carregarConfiguracao],
      envFilePath: ['.env', '../.env'],
    }),
    DatabaseModule,
    // Globais: praticamente todo módulo audita, calcula e resolve o ciclo.
    AuditoriaModule,
    CalculoModule,
    CiclosModule,
    UsuariosModule,
    AuthModule,
    MotivosModule,
    ParticipantesModule,
    ComitesModule,
    UploadsModule,
    ConsolidacaoModule,
  ],
  providers: [
    // Toda rota exige autenticação, salvo as marcadas com @Publico().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Controle de acesso por perfil (@Perfis()).
    { provide: APP_GUARD, useClass: PerfisGuard },
    // Contrato único de erro para toda a API.
    { provide: APP_FILTER, useClass: HttpExcecaoFilter },
  ],
})
export class AppModule {}
