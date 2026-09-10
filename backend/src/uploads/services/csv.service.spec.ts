import { ExcecaoUpload } from '../../common/filters';
import { CsvService } from './csv.service';
import { COLUNAS_BASE_ACRESCIMO, COLUNAS_BASE_PRINCIPAL } from './mapeamento-colunas';

const CABECALHO_PRINCIPAL =
  'FUNCIONAL;NOME;CARGO;NIVEL_CARGO;MODELO_AVALIACAO;AREA;AREA_ORIGEM;FPI;FPI_FINAL;FBPA;FD;VALORBASE;VALOR_PR_I;VALOR_PR_F;VLRTEORICO';

const csv = (...linhas: string[]) => Buffer.from(linhas.join('\n'), 'utf8');

describe('CsvService', () => {
  const servico = new CsvService();

  describe('detecção de delimitador', () => {
    it.each([
      ['a;b;c', ';'],
      ['a,b,c', ','],
      ['a\tb\tc', '\t'],
      ['a|b|c', '|'],
    ])('detecta %j como %j', (linha, esperado) => {
      expect(servico.detectarDelimitador(linha)).toBe(esperado);
    });
  });

  describe('validação estrutural', () => {
    it('rejeita arquivo vazio', () => {
      expect(() => servico.ler(Buffer.from(''), COLUNAS_BASE_PRINCIPAL)).toThrow(ExcecaoUpload);
    });

    it('rejeita arquivo só com cabeçalho', () => {
      expect(() => servico.ler(csv(CABECALHO_PRINCIPAL), COLUNAS_BASE_PRINCIPAL)).toThrow(
        /ao menos uma linha de dados/,
      );
    });

    it('rejeita arquivo sem as colunas obrigatórias e diz quais faltam', () => {
      expect(() => servico.ler(csv('NOME;CARGO', 'Ana;Analista'), COLUNAS_BASE_PRINCIPAL)).toThrow(
        /FUNCIONAL/,
      );
    });

    it('aceita cabeçalhos com acento, espaço ou caixa diferente', () => {
      const resultado = servico.ler(
        csv(
          'Matrícula;Nome;Nível de Cargo;FPI;FBPA;VALORBASE;VlrTeorico',
          '12345;Ana Souza;Pleno;1,10;1,00;10000;12000',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(1);
      expect(resultado.registros[0].dados).toMatchObject({
        funcional: '12345',
        nome: 'Ana Souza',
        nivelCargo: 'Pleno',
        fpi: 1.1,
        valorBase: 10000,
        vlrTeorico: 12000,
      });
    });
  });

  describe('validação de tipos', () => {
    it('separa registros válidos dos inválidos sem descartar o arquivo', () => {
      const resultado = servico.ler(
        csv(
          CABECALHO_PRINCIPAL,
          '1001;Ana;Analista;Pleno;Corporativo;TI;;1,10;1,15;1,00;0,05;10000;11000;11500;12000',
          '1002;Bruno;Analista;Pleno;Corporativo;TI;;NAO_E_NUMERO;;1,00;;10000;;;12000',
          '1003;Carla;Analista;Sênior;Corporativo;TI;;1,20;;1,00;;9000;;;9500',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.totalLinhas).toBe(3);
      expect(resultado.registros).toHaveLength(2);
      expect(resultado.erros).toHaveLength(1);
      expect(resultado.erros[0]).toMatchObject({ linha: 3, coluna: 'FPI' });
      expect(resultado.erros[0].mensagem).toMatch(/numérico/);
    });

    it('acusa coluna obrigatória vazia informando a linha', () => {
      const resultado = servico.ler(
        csv(
          CABECALHO_PRINCIPAL,
          ';Sem Funcional;Analista;Pleno;Corporativo;TI;;1,10;;1,00;;10000;;;12000',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(0);
      expect(resultado.erros[0]).toMatchObject({ linha: 2, coluna: 'FUNCIONAL' });
    });

    it('campos opcionais ausentes viram null', () => {
      const resultado = servico.ler(
        csv('FUNCIONAL;NOME;FPI;FBPA;VALORBASE;VLRTEORICO', '1001;Ana;1,1;1;10000;12000'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros[0].dados).toMatchObject({ cargo: null, areaOrigem: null, fd: null });
    });

    it('ignora linhas totalmente em branco', () => {
      const resultado = servico.ler(
        csv(
          'FUNCIONAL;NOME;FPI;FBPA;VALORBASE;VLRTEORICO',
          '1001;Ana;1,1;1;10000;12000',
          ';;;;;',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(1);
      expect(resultado.erros).toHaveLength(0);
    });

    it('relata colunas do arquivo que não são utilizadas', () => {
      const resultado = servico.ler(
        csv(
          'FUNCIONAL;NOME;FPI;FBPA;VALORBASE;VLRTEORICO;COLUNA_NOVA',
          '1001;Ana;1,1;1;10000;12000;valor',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.colunasIgnoradas).toEqual(['COLUNA_NOVA']);
    });
  });

  describe('base de acréscimo', () => {
    it('lê os acréscimos por área de origem', () => {
      const resultado = servico.ler(
        csv(
          'FUNCIONAL;AREA_ORIGEM;ACRESCIMO_PR_I;ACRESCIMO_PR_F;OBSERVACAO',
          '1001;Comercial;R$ 1.500,50;R$ 1.700,25;Transferência em março',
        ),
        COLUNAS_BASE_ACRESCIMO,
      );

      expect(resultado.registros[0].dados).toEqual({
        funcional: '1001',
        areaOrigem: 'Comercial',
        valorAcrescimoPrI: 1500.5,
        valorAcrescimoPrF: 1700.25,
        observacao: 'Transferência em março',
      });
    });

    it('exige as colunas de acréscimo', () => {
      expect(() =>
        servico.ler(csv('FUNCIONAL;AREA_ORIGEM', '1001;Comercial'), COLUNAS_BASE_ACRESCIMO),
      ).toThrow(/ACRESCIMO_PR_I/);
    });
  });
});
