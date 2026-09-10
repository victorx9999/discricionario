import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscricionarioModule } from '../discricionario/discricionario.module';
import { Grupo } from '../grupos/entities/grupo.entity';
import { ParticipantesModule } from '../participantes/participantes.module';
import { ComitesController } from './comites.controller';
import { ComitesService } from './comites.service';
import { AnaliseParticipante } from './entities/analise-participante.entity';
import { Comite } from './entities/comite.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comite, AnaliseParticipante, Grupo]),
    ParticipantesModule,
    DiscricionarioModule,
  ],
  controllers: [ComitesController],
  providers: [ComitesService],
  exports: [ComitesService],
})
export class ComitesModule {}
