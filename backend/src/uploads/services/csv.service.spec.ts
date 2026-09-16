import { ExcecaoUpload } from '../../common/filters';
import { CsvService, interpretarData } from './csv.service';
import { CAMPOS_DECISAO, COLUNAS_BASE_ACRESCIMO, COLUNAS_BASE_PRINCIPAL } from './mapeamento-colunas';

const csv = (...linhas: string[]) => Buffer.from(linhas.join('\n'), 'utf8');

const CABECALHO_MINIMO = 'EMPLID;NAME;FPI;CALC4;VALORBASE;VLR_TEORICO';

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
      expect(() => servico.ler(csv(CABECALHO_MINIMO), COLUNAS_BASE_PRINCIPAL)).toThrow(
        /ao menos uma linha de dados/,
      );
    });

    it('rejeita arquivo sem as colunas obrigatórias e diz quais faltam', () => {
      expect(() => servico.ler(csv('NAME;AREA', 'Ana;TI'), COLUNAS_BASE_PRINCIPAL)).toThrow(
        /EMPLID/,
      );
    });

    it('aceita cabeçalhos com acento, espaço ou caixa diferente', () => {
      const resultado = servico.ler(
        csv(
          'Emplid;Name;FPI;Calc4;ValorBase;Vlr_Teorico;XlatLongName;Modelo_Avaliacao',
          '80000001;Ana Souza;1,10;220.000,00;180.500,00;250.000,00;Coordenador;Institucional',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(1);
      expect(resultado.registros[0].dados).toMatchObject({
        emplid: '80000001',
        nome: 'Ana Souza',
        fpi: 1.1,
        calc4: 220000,
        valorBase: 180500,
        vlrTeorico: 250000,
        xlatlongname: 'Coordenador',
        modeloAvaliacao: 'Institucional',
      });
    });
  });

  describe('validação de tipos', () => {
    it('separa registros válidos dos inválidos sem descartar o arquivo', () => {
      const resultado = servico.ler(
        csv(
          CABECALHO_MINIMO,
          '80000001;Ana;1,10;220000;180500;250000',
          '80000002;Bruno;NAO_E_NUMERO;220000;180500;250000',
          '80000003;Carla;1,20;230000;190000;260000',
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
        csv(CABECALHO_MINIMO, ';Sem funcional;1,10;220000;180500;250000'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(0);
      expect(resultado.erros[0]).toMatchObject({ linha: 2, coluna: 'EMPLID' });
    });

    it('interpreta booleanos de sócio', () => {
      const resultado = servico.ler(
        csv(
          `${CABECALHO_MINIMO};SOCIO_ANO;SOCIO_ANO_ANTERIOR`,
          '80000001;Ana;1,10;220000;180500;250000;Sim;Não',
        ),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros[0].dados).toMatchObject({
        socioAno: true,
        socioAnoAnterior: false,
      });
    });

    it('interpreta datas em formato brasileiro e ISO', () => {
      const resultado = servico.ler(
        csv(`${CABECALHO_MINIMO};LAST_HIRE_DT`, '80000001;Ana;1,10;220000;180500;250000;15/03/2018'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros[0].dados.dataAdmissao).toBeInstanceOf(Date);
      expect(interpretarData('2018-03-15')?.getFullYear()).toBe(2018);
      expect(interpretarData('texto')).toBeNull();
    });

    it('coluna ausente do arquivo não entra no registro', () => {
      // É o que impede a carga parcial de zerar campos que o arquivo não traz.
      const resultado = servico.ler(
        csv(CABECALHO_MINIMO, '80000001;Ana;1,10;220000;180500;250000'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect('area' in resultado.registros[0].dados).toBe(false);
      expect('totalCash' in resultado.registros[0].dados).toBe(false);
    });

    it('coluna presente mas vazia vira null', () => {
      const resultado = servico.ler(
        csv(`${CABECALHO_MINIMO};AREA`, '80000001;Ana;1,10;220000;180500;250000;'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros[0].dados.area).toBeNull();
    });

    it('ignora linhas totalmente em branco', () => {
      const resultado = servico.ler(
        csv(CABECALHO_MINIMO, '80000001;Ana;1,10;220000;180500;250000', ';;;;;'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.registros).toHaveLength(1);
      expect(resultado.erros).toHaveLength(0);
    });

    it('relata colunas do arquivo que não são utilizadas', () => {
      const resultado = servico.ler(
        csv(`${CABECALHO_MINIMO};COLUNA_NOVA`, '80000001;Ana;1,10;220000;180500;250000;valor'),
        COLUNAS_BASE_PRINCIPAL,
      );

      expect(resultado.colunasIgnoradas).toEqual(['COLUNA_NOVA']);
    });
  });

  describe('base de acréscimo', () => {
    it('lê a linha de acréscimo com as flags de elegibilidade', () => {
      const resultado = servico.ler(
        csv(
          'EMPLID;FLAG_CALCULAR_POOL;TIPO_SIMULADOR;IDPOOL;GRUPO_RANKING;VLR_TEORICO;VL_PR_I',
          '80000002;Sim;Institucional;Dentro de Pool;;R$ 20.000,00;R$ 16.381,70',
        ),
        COLUNAS_BASE_ACRESCIMO,
      );

      expect(resultado.registros[0].dados).toMatchObject({
        emplid: '80000002',
        flagCalcularPool: true,
        tipoSimulador: 'Institucional',
        idpool: 'Dentro de Pool',
        grupoRanking: null,
        vlrTeorico: 20000,
        vlPrI: 16381.7,
      });
    });

    it('exige as colunas de elegibilidade', () => {
      expect(() =>
        servico.ler(csv('EMPLID;VLR_TEORICO', '80000002;20000'), COLUNAS_BASE_ACRESCIMO),
      ).toThrow(/FLAG_CALCULAR_POOL|TIPO_SIMULADOR|IDPOOL/);
    });
  });

  describe('campos de decisão', () => {
    it('são os preservados na carga parcial', () => {
      expect(CAMPOS_DECISAO).toEqual(
        expect.arrayContaining([
          'fd',
          'notaDiscricionario',
          'motivoDiscricionario',
          'codMotivador',
          'observacaoPoscomite',
        ]),
      );
    });
  });
});
