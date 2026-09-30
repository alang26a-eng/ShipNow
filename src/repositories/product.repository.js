import Product from '../models/product.model.js';
import { createRepository } from './base.repository.js';
export default createRepository(Product, { _id: 1, name: 1, price: 1, stock: 1, status: 1, createdAt: 1, updatedAt: 1 });
