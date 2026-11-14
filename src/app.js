import { createUploadRoutes } from './routes/upload.routes.js';
import { mountSwagger } from './config/swagger.js';
import { createShippingRoutes } from './routes/shipping.routes.js';
import express from 'express';
import { createProductRoutes } from './routes/product.routes.js';
import { createUserRoutes } from './routes/user.routes.js';
import { createMockRoutes } from './routes/mock.routes.js';
import { createErrorHandler } from './middlewares/error-handler.js';
import { RouteNotFoundError } from './errors/domain-errors.js';
import logger from './config/logger.js';
import { requestLogger } from './middlewares/request-logger.js';
import { createLoggerRoutes } from './routes/logger.routes.js';
export function createApp({ productService, userService, mockService, orderService, deliveryService, uploadService, mocksEnabled = true,
  log = logger, nodeEnv = 'production', loggerTestEnabled = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestLogger(log));
  app.use(express.json({ limit: '100kb' }));
  mountSwagger(app, { mocksEnabled: mocksEnabled && Boolean(mockService), loggerEnabled: nodeEnv !== 'production' && loggerTestEnabled, ordersEnabled: Boolean(orderService), deliveriesEnabled: Boolean(deliveryService), uploadsEnabled: Boolean(uploadService) });
  if (uploadService) app.use('/api', createUploadRoutes(uploadService, { deliveriesEnabled: Boolean(deliveryService) }));
  if (orderService) app.use('/api/orders', createShippingRoutes(orderService));
  if (deliveryService) app.use('/api/deliveries', createShippingRoutes(deliveryService));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  if (nodeEnv !== 'production' && loggerTestEnabled) app.use('/api/logger-test', createLoggerRoutes(log));
  app.use('/api/products', createProductRoutes(productService));
  app.use('/api/users', createUserRoutes(userService));
  if (mocksEnabled && mockService) app.use('/api/mocks', createMockRoutes(mockService));
  app.use((req, res, next) => next(new RouteNotFoundError()));
  app.use(createErrorHandler(log));
  return app;
}
