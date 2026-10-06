import mongoose from 'mongoose';
import { ORDER_PRIORITIES, ORDER_STATUSES } from '../constants/index.js';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, required: true, trim: true, maxlength: 300 },
  pickupAddress: { type: String, required: true, trim: true },
  deliveryAddress: { type: String, required: true, trim: true },
  weightKg: { type: Number, required: true, min: 0.01 },
  status: { type: String, enum: Object.values(ORDER_STATUSES), default: ORDER_STATUSES.PENDING },
  priority: { type: String, enum: Object.values(ORDER_PRIORITIES), default: ORDER_PRIORITIES.NORMAL },
  mockBatchId: { type: String, select: false, index: true }
}, { timestamps: true, versionKey: false });

export default mongoose.model('Order', schema);
