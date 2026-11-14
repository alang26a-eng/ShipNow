import { Router } from 'express';
import { receiveUpload } from '../config/uploads.js';
import { createUploadController } from '../controllers/upload.controller.js';

export function createUploadRoutes(service, { deliveriesEnabled }) {
  const router = Router();
  const controller = createUploadController(service);
  router.post('/users/:id/documents', receiveUpload, controller.document);
  if (deliveriesEnabled) router.post('/deliveries/:id/proofs', receiveUpload, controller.proof);
  return router;
}
