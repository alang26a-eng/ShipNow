import User from '../models/user.model.js';
import { createRepository } from './base.repository.js';
export default createRepository(User, { _id: 1, name: 1, email: 1, role: 1, createdAt: 1, updatedAt: 1 });
