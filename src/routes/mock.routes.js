import { Router } from 'express';
import { createMockController } from '../controllers/mock.controller.js';

export function createMockRoutes(service) {
  const router = Router();
  const controller = createMockController(service);
  router.get('/users', controller.users);
  router.get('/drivers', controller.drivers);
  router.get('/orders', controller.orders);
  router.get('/deliveries', controller.deliveries);
  router.get('/scenario', controller.scenario);
  router.post('/seed', controller.seed);
  return router;
}
