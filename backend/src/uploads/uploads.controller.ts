import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { PerfilUsuario } from '../common/enums';
import { ListarUploadsQueryDto, ProcessarUploadDto, ResultadoUploadDto } from './dto';
import { UploadsService } from './uploads.service';

const CORPO_UPLOAD = {
  schema: {
    type: 'object',
    required: ['file', 'tipoBase'],
    properties: {
      file: { type: 'string', format: 'binary' },
      tipoBase: { type: 'string', enum: ['PRINCIPAL', 'ACRESCIMO'] },
      modo: { type: 'string', enum: ['COMPLETA', 'PARCIAL'], default: 'PARCIAL' },
      ciclo: { type: 'integer', example: 2027 },
      vincularPorGrupoRanking: { type: 'boolean', default: true },
      confirmarReinicioDoCiclo: { type: 'boolean', default: false },
    },
  },
};

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('previa')
  @Perfis(PerfilUsuario.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CORPO_UPLOAD)
  @ApiOperation({
    summary:
      'Pré-visualiza a carga: colunas reconhecidas e ignoradas, novos, atualizados e o que o reinício apagaria',
  })
  previa(@UploadedFile() arquivo: Express.Multer.File, @Body() dto: ProcessarUploadDto) {
    return this.uploadsService.previsualizar(arquivo, dto);
  }

  @Post()
  @Perfis(PerfilUsuario.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CORPO_UPLOAD)
  @ApiOperation({ summary: 'Carrega uma base (CSV) no ciclo informado ou no ciclo ativo' })
  processar(
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() dto: ProcessarUploadDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ): Promise<ResultadoUploadDto> {
    return this.uploadsService.processar(arquivo, dto, usuario, contexto);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de cargas do ciclo (?ciclo=2026 para consultar outro ano)' })
  listar(@Query() query: ListarUploadsQueryDto) {
    return this.uploadsService.listar(query);
  }

  @Get('layouts')
  @ApiOperation({ summary: 'Layout esperado de TBPR_Simuladores e TBPR_Simuladores_Acres' })
  layouts() {
    return this.uploadsService.obterLayouts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma carga' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.uploadsService.buscarPorId(id);
  }

  @Get(':id/erros')
  @ApiOperation({ summary: 'Registros inválidos de uma carga' })
  erros(@Param('id', ParseUUIDPipe) id: string) {
    return this.uploadsService.listarErros(id);
  }
}
