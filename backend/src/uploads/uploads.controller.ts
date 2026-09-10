import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContextoRequisicao, Perfis, UsuarioAtual, UsuarioAutenticado } from '../auth/decorators';
import { ContextoAuditoria } from '../auditoria/dto/registrar-auditoria.dto';
import { PerfilUsuario } from '../common/enums';
import { ListarUploadsQueryDto, ProcessarUploadDto, ResultadoUploadDto } from './dto';
import { UploadsService } from './uploads.service';

@ApiTags('importacoes')
@ApiBearerAuth()
@Controller('importacoes')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.ATENDIMENTO)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia e processa uma base (CSV)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'tipoBase', 'modo'],
      properties: {
        file: { type: 'string', format: 'binary' },
        tipoBase: { type: 'string', enum: ['PRINCIPAL', 'ACRESCIMO'] },
        modo: { type: 'string', enum: ['COMPLETO', 'INCREMENTAL'] },
      },
    },
  })
  processar(
    @UploadedFile() arquivo: Express.Multer.File,
    @Body() dto: ProcessarUploadDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoRequisicao() contexto: ContextoAuditoria,
  ): Promise<ResultadoUploadDto> {
    return this.uploadsService.processar(arquivo, dto, usuario, contexto);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico paginado de importações' })
  listar(@Query() query: ListarUploadsQueryDto) {
    return this.uploadsService.listar(query);
  }

  @Get('formatos')
  @ApiOperation({ summary: 'Layout esperado de cada base (colunas obrigatórias e aliases aceitos)' })
  layouts() {
    return this.uploadsService.obterLayouts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma importação' })
  buscar(@Param('id', ParseUUIDPipe) id: string) {
    return this.uploadsService.buscarPorId(id);
  }

  @Get(':id/erros')
  @ApiOperation({ summary: 'Lista os registros inválidos de uma importação' })
  erros(@Param('id', ParseUUIDPipe) id: string) {
    return this.uploadsService.listarErros(id);
  }
}
