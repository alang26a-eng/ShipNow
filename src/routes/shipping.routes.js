import { Router } from 'express';
export function createShippingRoutes(service) {
  const router = Router();
  router.get('/', async (req, res) => res.json({ data: await service.list(req.query) }));
  router.get('/:id', async (req, res) => res.json({ data: await service.get(req.params.id) }));
  router.post('/', async (req, res) => res.status(201).json({ data: await service.create(req.body) }));
  router.patch('/:id', async (req, res) => res.json({ data: await service.update(req.params.id, req.body) }));
  return router;
}
