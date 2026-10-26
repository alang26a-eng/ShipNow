import loadConfig, { getLoggingConfig } from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import productRepository from './repositories/product.repository.js';
import userRepository from './repositories/user.repository.js';
import { createProductService } from './services/product.service.js';
import { createUserService } from './services/user.service.js';
import mockRepository from './repositories/mock.repository.js';
import { createMockService } from './services/mock.service.js';
import logger, { configureLogger, closeLogger } from './config/logger.js';

// Un fallo de configuración debe poder verse también al lanzar el proceso en test.
configureLogger({ ...getLoggingConfig(), consoleEnabled: true });
try {
  const config = loadConfig();
  configureLogger(config.logging);
  logger.debug('Configuración de logging inicializada', { environment: config.nodeEnv });
  await connectDatabase(config.mongodbUri);
  const app = createApp({
    productService: createProductService(productRepository),
    userService: createUserService(userRepository),
    mockService: createMockService(mockRepository, { seedEnabled: config.mockSeedEnabled, nodeEnv: config.nodeEnv }),
    mocksEnabled: config.mocksEnabled, log: logger, nodeEnv: config.nodeEnv, loggerTestEnabled: config.loggerTestEnabled
  });
  const server = app.listen(config.port, () => logger.info('Servidor ShipNow escuchando en el puerto ' + config.port));
  let stopping = false;
  const shutdown = (reason, failure) => {
    if (stopping) return;
    stopping = true;
    if (failure) {
      logger.fatal('Falla crítica del servidor HTTP', { error: failure });
      process.exitCode = 1;
    } else logger.info('Cierre del servidor solicitado', { reason });
    const timeout = setTimeout(async () => {
      logger.fatal('Se agotó el tiempo de cierre del servidor');
      // El cierre no puede esperar indefinidamente por sockets abiertos.
      await Promise.race([closeLogger(), new Promise(resolve => setTimeout(resolve, 500))]);
      process.exit(1);
    }, 10000);
    timeout.unref();
    server.close(async () => {
      try {
        await disconnectDatabase();
        logger.info('Servidor cerrado y conexión a MongoDB finalizada');
      } catch (error) { logger.error('Error durante el cierre de MongoDB', { error }); process.exitCode = 1; }
      finally { clearTimeout(timeout); await closeLogger(); }
    });
  };
  server.on('error', error => shutdown('http_error', error));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
} catch (error) {
  logger.fatal(error.message.startsWith('Configuración inválida:')
    ? error.message : 'No se pudo iniciar ShipNow. Revisá la conexión y los índices de MongoDB.', { error });
  try { await disconnectDatabase(); }
  catch (disconnectError) { logger.error('Error al cerrar MongoDB después de un inicio fallido', { error: disconnectError }); }
  process.exitCode = 1;
  await closeLogger();
}
