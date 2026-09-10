/**
 * Configuração central da aplicação.
 * Toda leitura de `process.env` do projeto acontece aqui.
 */

const booleano = (valor: string | undefined, padrao = false): boolean => {
  if (valor === undefined) return padrao;
  return ['1', 'true', 'yes', 'sim'].includes(valor.toLowerCase());
};

const numero = (valor: string | undefined, padrao: number): number => {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : padrao;
};

export interface ConfiguracaoApp {
  ambiente: string;
  porta: number;
  prefixoApi: string;
  corsOrigins: string[];
  banco: {
    host: string;
    porta: number;
    nome: string;
    usuario: string;
    senha: string;
    logging: boolean;
    executarMigrations: boolean;
  };
  jwt: {
    segredo: string;
    expiraEm: string;
  };
  upload: {
    tamanhoMaximoMb: number;
  };
  negocio: {
    /** Percentual do VLRTEORICO que compõe o pool (0.01 = 1%). */
    poolPercentual: number;
    /** Limite absoluto do discricionário (0.15 = 15pp). */
    limiteDiscricionario: number;
  };
}

export const carregarConfiguracao = (): ConfiguracaoApp => ({
  ambiente: process.env.NODE_ENV ?? 'development',
  porta: numero(process.env.PORT, 3000),
  prefixoApi: process.env.API_PREFIX ?? 'api',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((origem) => origem.trim()),
  banco: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    porta: numero(process.env.DATABASE_PORT, 5432),
    nome: process.env.DATABASE_NAME ?? 'discretionary',
    usuario: process.env.DATABASE_USER ?? 'postgres',
    senha: process.env.DATABASE_PASSWORD ?? 'postgres',
    logging: booleano(process.env.DATABASE_LOGGING, false),
    executarMigrations: booleano(process.env.DATABASE_RUN_MIGRATIONS, true),
  },
  jwt: {
    segredo: process.env.JWT_SECRET ?? 'troque-este-segredo-em-producao',
    expiraEm: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  upload: {
    tamanhoMaximoMb: numero(process.env.UPLOAD_MAX_FILE_SIZE_MB, 50),
  },
  negocio: {
    poolPercentual: numero(process.env.POOL_PERCENTUAL, 0.01),
    limiteDiscricionario: numero(process.env.LIMITE_DISCRICIONARIO, 0.15),
  },
});

export default carregarConfiguracao;
