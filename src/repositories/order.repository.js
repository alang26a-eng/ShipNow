import Model from '../models/order.model.js';
import { createRepository } from './base.repository.js';
export default createRepository(Model, {"_id":1,"createdAt":1,"updatedAt":1,"user":1,"description":1,"pickupAddress":1,"deliveryAddress":1,"weightKg":1,"items":1,"status":1,"priority":1});
