import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Motivo } from './entities/motivo.entity';
import { MotivosController } from './motivos.controller';
import { MotivosService } from './motivos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Motivo])],
  controllers: [MotivosController],
  providers: [MotivosService],
  exports: [MotivosService],
})
export class MotivosModule {}
