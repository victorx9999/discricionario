import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalculoModule } from '../discricionario/calculo.module';
import { AcrescimoParticipante } from './entities/acrescimo-participante.entity';
import { Participante } from './entities/participante.entity';
import { ParticipantesController } from './participantes.controller';
import { ParticipantesService } from './participantes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Participante, AcrescimoParticipante]), CalculoModule],
  controllers: [ParticipantesController],
  providers: [ParticipantesService],
  exports: [ParticipantesService],
})
export class ParticipantesModule {}
