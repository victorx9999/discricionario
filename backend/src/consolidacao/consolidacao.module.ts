import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComitesModule } from '../comites/comites.module';
import { Comite } from '../comites/entities/comite.entity';
import { Participante } from '../participantes/entities/participante.entity';
import { ConsolidacaoController } from './consolidacao.controller';
import { ConsolidacaoService } from './consolidacao.service';

@Module({
  imports: [TypeOrmModule.forFeature([Comite, Participante]), ComitesModule],
  controllers: [ConsolidacaoController],
  providers: [ConsolidacaoService],
})
export class ConsolidacaoModule {}
