import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, PerfisGuard } from './auth/guards';
import { HttpExcecaoFilter } from './common/filters';
import { ComitesModule } from './comites/comites.module';
import { carregarConfiguracao } from './config/configuracao';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { DiscricionarioModule } from './discricionario/discricionario.module';
import { GruposModule } from './grupos/grupos.module';
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
    AuditoriaModule,
    UsuariosModule,
    AuthModule,
    ParticipantesModule,
    GruposModule,
    DiscricionarioModule,
    ComitesModule,
    UploadsModule,
    DashboardModule,
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
