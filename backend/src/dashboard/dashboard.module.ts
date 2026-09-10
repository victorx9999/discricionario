import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnaliseParticipante } from '../comites/entities/analise-participante.entity';
import { Comite } from '../comites/entities/comite.entity';
import { CalculoModule } from '../discricionario/calculo.module';
import { Grupo } from '../grupos/entities/grupo.entity';
import { Participante } from '../participantes/entities/participante.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comite, Grupo, Participante, AnaliseParticipante]),
    CalculoModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
