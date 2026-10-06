import loadConfig from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import productRepository from './repositories/product.repository.js';
import userRepository from './repositories/user.repository.js';
import { createProductService } from './services/product.service.js';
import { createUserService } from './services/user.service.js';
import mockRepository from './repositories/mock.repository.js';
import { createMockService } from './services/mock.service.js';

try {
  const config = loadConfig();
  await connectDatabase(config.mongodbUri);
  const app = createApp({
    productService: createProductService(productRepository),
    userService: createUserService(userRepository),
    mockService: createMockService(mockRepository, { seedEnabled: config.mockSeedEnabled, nodeEnv: config.nodeEnv }),
    mocksEnabled: config.mocksEnabled
  });
  const server = app.listen(config.port, () => console.log('ShipNow disponible en http://localhost:' + config.port));
  server.on('error', async () => {
    console.error('No se pudo abrir el puerto HTTP.');
    await disconnectDatabase();
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await disconnectDatabase();
      clearTimeout(timeout);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(error.message.startsWith('Configuración inválida:')
    ? error.message : 'No se pudo iniciar ShipNow. Revisá la conexión y los índices de MongoDB.');
  await disconnectDatabase();
  process.exitCode = 1;
}
