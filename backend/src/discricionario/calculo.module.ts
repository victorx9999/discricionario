import { Module } from '@nestjs/common';
import { CalculoService } from './services/calculo.service';

/**
 * Módulo isolado do serviço de cálculo.
 *
 * Sem dependência de banco, é importado por uploads, participantes,
 * comitês e discricionário sem criar ciclos entre módulos.
 */
@Module({
  providers: [CalculoService],
  exports: [CalculoService],
})
export class CalculoModule {}
