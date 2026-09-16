import { Global, Module } from '@nestjs/common';
import { CalculoService } from './calculo.service';

/**
 * Cálculo — sem dependência de banco, importado por uploads, participantes,
 * comitês e consolidação. É `@Global()` para manter as dependências entre
 * módulos em uma única direção.
 */
@Global()
@Module({
  providers: [CalculoService],
  exports: [CalculoService],
})
export class CalculoModule {}
