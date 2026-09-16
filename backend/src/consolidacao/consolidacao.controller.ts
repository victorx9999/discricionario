import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { ConsolidacaoService } from './consolidacao.service';

const CICLO = { name: 'ciclo', required: false, example: 2026, description: 'Ano do ciclo' };

@ApiTags('consolidacao')
@ApiBearerAuth()
@Controller('consolidacao')
export class ConsolidacaoController {
  constructor(private readonly consolidacaoService: ConsolidacaoService) {}

  @Get('visao-geral')
  @ApiQuery(CICLO)
  @ApiOperation({ summary: 'KPIs, alertas, gráficos e detalhe por comitê' })
  visaoGeral(@UsuarioAtual() usuario: UsuarioAutenticado, @Query('ciclo') ciclo?: string) {
    return this.consolidacaoService.visaoGeral(ciclo ? Number(ciclo) : undefined, usuario);
  }

  @Get('comparativo')
  @ApiQuery(CICLO)
  @ApiQuery({
    name: 'comites',
    required: false,
    description: 'IDs separados por vírgula. Omitido, compara todos os visíveis.',
  })
  @ApiOperation({ summary: 'Visão consolidada de vários comitês, para levar à discussão' })
  comparativo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Query('comites') comites?: string,
    @Query('ciclo') ciclo?: string,
  ) {
    const ids = (comites ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return this.consolidacaoService.comparativo(ids, ciclo ? Number(ciclo) : undefined, usuario);
  }

  @Get('discricionarios-nominais')
  @ApiQuery(CICLO)
  @ApiOperation({ summary: 'Lista completa dos discricionários concedidos no ciclo' })
  nominais(@UsuarioAtual() usuario: UsuarioAutenticado, @Query('ciclo') ciclo?: string) {
    return this.consolidacaoService.discricionariosNominais(
      ciclo ? Number(ciclo) : undefined,
      usuario,
    );
  }

  @Get('controle-grupos')
  @ApiQuery(CICLO)
  @ApiOperation({
    summary: 'Prontidão para conclusão, distribuição por nível e elegíveis sem grupo',
  })
  controle(@UsuarioAtual() usuario: UsuarioAutenticado, @Query('ciclo') ciclo?: string) {
    return this.consolidacaoService.controleDeGrupos(ciclo ? Number(ciclo) : undefined, usuario);
  }
}
