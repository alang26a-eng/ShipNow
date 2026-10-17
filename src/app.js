import express from 'express';
import { createProductRoutes } from './routes/product.routes.js';
import { createUserRoutes } from './routes/user.routes.js';
import { createMockRoutes } from './routes/mock.routes.js';
import { errorHandler } from './middlewares/error-handler.js';
import { RouteNotFoundError } from './errors/domain-errors.js';
export function createApp({ productService, userService, mockService, mocksEnabled = true }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/products', createProductRoutes(productService));
  app.use('/api/users', createUserRoutes(userService));
  if (mocksEnabled && mockService) app.use('/api/mocks', createMockRoutes(mockService));
  app.use((req, res, next) => next(new RouteNotFoundError()));
  app.use(errorHandler);
  return app;
}
