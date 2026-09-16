/**
 * Proxy do dev-server.
 *
 * Fora do Docker a API está em localhost:3000; dentro do compose ela atende
 * pelo nome do serviço. `API_URL` cobre os dois casos sem editar arquivo.
 */
module.exports = {
  '/api': {
    target: process.env.API_URL || 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
  },
};
