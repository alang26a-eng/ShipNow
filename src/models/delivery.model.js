import mongoose from 'mongoose';
import { DELIVERY_STATUSES, DRIVER_REQUIRED_STATUSES } from '../constants/index.js';

const schema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  driver: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null,
    required() { return DRIVER_REQUIRED_STATUSES.includes(this.status); }
  },
  status: { type: String, enum: Object.values(DELIVERY_STATUSES), default: DELIVERY_STATUSES.PENDING },
  deliveredAt: {
    type: Date, default: null,
    required() { return this.status === DELIVERY_STATUSES.DELIVERED; }
  },
  mockBatchId: { type: String, select: false, index: true }
}, { timestamps: true, versionKey: false });

export default mongoose.model('Delivery', schema);
