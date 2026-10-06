import mongoose from 'mongoose';
import { USER_ROLES } from '../constants/index.js';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  role: { type: String, enum: Object.values(USER_ROLES), default: USER_ROLES.USER },
  deletedAt: { type: Date, default: null, select: false },
  mockBatchId: { type: String, select: false, index: true }
}, { timestamps: true, versionKey: false });
export default mongoose.model('User', schema);
