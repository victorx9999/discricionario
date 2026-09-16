import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CiclosController } from './ciclos.controller';
import { CiclosService } from './ciclos.service';
import { Ciclo } from './entities/ciclo.entity';

/**
 * Módulo de ciclos.
 *
 * É `@Global()` porque praticamente todo módulo precisa resolver o ciclo da
 * requisição (`?ciclo=2026` ou o ativo) antes de consultar ou gravar.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Ciclo])],
  controllers: [CiclosController],
  providers: [CiclosService],
  exports: [CiclosService],
})
export class CiclosModule {}
