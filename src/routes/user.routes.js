import { Router } from 'express';
import { createUserController } from '../controllers/user.controller.js';
export function createUserRoutes(service) {
  const router = Router();
  const controller = createUserController(service);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
