import { createApp } from './app.js';
import logger from './config/logger.js';
import deliveryRepository from './repositories/delivery.repository.js';
import mockRepository from './repositories/mock.repository.js';
import orderRepository from './repositories/order.repository.js';
import productRepository from './repositories/product.repository.js';
import userRepository from './repositories/user.repository.js';
import { createMockService } from './services/mock.service.js';
import { createProductService } from './services/product.service.js';
import { createShippingService } from './services/shipping.service.js';
import { createUserService } from './services/user.service.js';

export function createConfiguredApp(config, log = logger) {
  return createApp({
    orderService: createShippingService('order', orderRepository, { users: userRepository }),
    deliveryService: createShippingService('delivery', deliveryRepository, {
      users: userRepository, orders: orderRepository
    }),
    productService: createProductService(productRepository, { log }),
    userService: createUserService(userRepository, { log }),
    mockService: createMockService(mockRepository, {
      seedEnabled: config.mockSeedEnabled, nodeEnv: config.nodeEnv, log
    }),
    mocksEnabled: config.mocksEnabled,
    loggerTestEnabled: config.loggerTestEnabled,
    nodeEnv: config.nodeEnv,
    log
  });
}
