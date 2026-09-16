import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ConfiguracaoApp } from './config/configuracao';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  const prefixo = config.get<string>('prefixoApi') ?? 'api/v1';
  const porta = config.get<number>('porta') ?? 3000;
  const origens = config.get<string[]>('corsOrigins') ?? ['*'];

  app.setGlobalPrefix(prefixo);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: origens.includes('*') ? true : origens,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Só chega ao service o que está declarado no DTO.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API — Discricionário de Remuneração')
      .setDescription(
        'Comitês Discricionários da Remuneração Variável: ciclos anuais com histórico, carga das ' +
          'bases TBPR_Simuladores e TBPR_Simuladores_Acres, comitês, ATA, lançamento do FD, ' +
          'controle de pool, resumos por nível de cargo e trilha de auditoria.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${prefixo}/docs`, app, documento, {
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  await app.listen(porta, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  const negocio = config.get<ConfiguracaoApp['negocio']>('negocio');
  logger.log(`API disponível em http://localhost:${porta}/${prefixo}`);
  logger.log(`Documentação Swagger em http://localhost:${porta}/${prefixo}/docs`);
  logger.log(
    `Premissas padrão de novos ciclos: pool = ${negocio.poolPercentual * 100}% do VLR_TEORICO | ` +
      `limite do FD = ±${negocio.limiteDiscricionario * 100}pp. ` +
      'Cada ciclo guarda as suas próprias premissas.',
  );
}

void bootstrap();
