import { Router } from 'express';
import { createProductController } from '../controllers/product.controller.js';
export function createProductRoutes(service) {
  const router = Router();
  const controller = createProductController(service);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
