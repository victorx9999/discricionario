import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListarParticipantesQueryDto } from './dto';
import { ParticipantesService } from './participantes.service';

@ApiTags('participantes')
@ApiBearerAuth()
@Controller('participantes')
export class ParticipantesController {
  constructor(private readonly participantesService: ParticipantesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista participantes com paginação, busca e filtros aplicados no banco',
  })
  listar(@Query() query: ListarParticipantesQueryDto) {
    return this.participantesService.listar(query);
  }

  @Get('filtros')
  @ApiOperation({ summary: 'Valores distintos para popular os filtros das tabelas' })
  filtros() {
    return this.participantesService.listarOpcoesFiltro();
  }

  @Get('ids')
  @ApiOperation({
    summary: 'Retorna somente os IDs que atendem ao filtro (suporte ao "selecionar todos")',
  })
  ids(@Query() query: ListarParticipantesQueryDto) {
    return this.participantesService.listarIds(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um participante, com acréscimos e visão anual' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.participantesService.buscarDetalhe(id);
  }
}
