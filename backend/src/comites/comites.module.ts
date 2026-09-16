import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Participante } from '../participantes/entities/participante.entity';
import { ParticipantesModule } from '../participantes/participantes.module';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { ComitesController } from './comites.controller';
import { ComitesService } from './comites.service';
import { Ata } from './entities/ata.entity';
import { AtaParticipante } from './entities/ata-participante.entity';
import { ComiteColuna } from './entities/comite-coluna.entity';
import { ComiteResponsavel } from './entities/comite-responsavel.entity';
import { Comite } from './entities/comite.entity';
import { AtasService } from './services/atas.service';
import { ColunasComiteService } from './services/colunas.service';
import { ResumoComiteService } from './services/resumo.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comite,
      ComiteResponsavel,
      ComiteColuna,
      Ata,
      AtaParticipante,
      Participante,
      Usuario,
    ]),
    ParticipantesModule,
  ],
  controllers: [ComitesController],
  providers: [ComitesService, ResumoComiteService, AtasService, ColunasComiteService],
  exports: [ComitesService, ResumoComiteService],
})
export class ComitesModule {}
