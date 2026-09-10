import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comite } from '../comites/entities/comite.entity';
import { CalculoModule } from '../discricionario/calculo.module';
import { ParticipantesModule } from '../participantes/participantes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { GrupoResponsavel } from './entities/grupo-responsavel.entity';
import { Grupo } from './entities/grupo.entity';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Grupo, GrupoResponsavel, Comite]),
    UsuariosModule,
    ParticipantesModule,
    CalculoModule,
  ],
  controllers: [GruposController],
  providers: [GruposService],
  exports: [GruposService],
})
export class GruposModule {}
