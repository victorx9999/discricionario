import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comite } from '../comites/entities/comite.entity';
import { Motivo } from '../motivos/entities/motivo.entity';
import { Acrescimo } from './entities/acrescimo.entity';
import { Participante } from './entities/participante.entity';
import { ParticipantesController } from './participantes.controller';
import { ParticipantesService } from './participantes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Participante, Acrescimo, Motivo, Comite])],
  controllers: [ParticipantesController],
  providers: [ParticipantesService],
  exports: [ParticipantesService],
})
export class ParticipantesModule {}
