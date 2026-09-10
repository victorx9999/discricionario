import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';
import { LogAuditoria } from './entities/log-auditoria.entity';

/**
 * Módulo independente de auditoria.
 *
 * É `@Global()` porque praticamente todo módulo de negócio precisa registrar
 * ações — assim o `AuditoriaService` fica disponível sem que cada módulo
 * precise importar explicitamente, mantendo a dependência em uma direção só
 * (negócio -> auditoria).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LogAuditoria])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
