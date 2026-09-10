import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('painel')
@ApiBearerAuth()
@Controller('painel')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'Resumo da página inicial: comitês, grupos, participantes, analisados, pendentes e pool',
  })
  resumo() {
    return this.dashboardService.resumo();
  }

  @Get('graficos')
  @ApiOperation({
    summary: 'Séries para os gráficos: por nível de cargo, modelo de avaliação e status de análise',
  })
  graficos() {
    return this.dashboardService.graficos();
  }
}
