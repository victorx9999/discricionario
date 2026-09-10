import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnaliseParticipante } from '../comites/entities/analise-participante.entity';
import { CalculoModule } from './calculo.module';
import { DiscricionarioController } from './discricionario.controller';
import { DiscricionarioService } from './discricionario.service';
import { AvaliacaoComportamental } from './entities/avaliacao-comportamental.entity';
import { Discricionario } from './entities/discricionario.entity';
import { PoolService } from './services/pool.service';
import { ResumoService } from './services/resumo.service';

/**
 * Discricionário, pool e resumos.
 *
 * Depende apenas das *entidades* de comitê (não do `ComitesModule`), o que
 * mantém as dependências entre módulos em uma única direção:
 * ComitesModule -> DiscricionarioModule -> CalculoModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Discricionario, AvaliacaoComportamental, AnaliseParticipante]),
    CalculoModule,
  ],
  controllers: [DiscricionarioController],
  providers: [DiscricionarioService, PoolService, ResumoService],
  exports: [DiscricionarioService, PoolService, ResumoService, CalculoModule],
})
export class DiscricionarioModule {}
