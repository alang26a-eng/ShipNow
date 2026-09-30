import mongoose from 'mongoose';
import { PRODUCT_STATUSES } from '../constants/index.js';
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
  status: { type: String, enum: Object.values(PRODUCT_STATUSES), required: true },
  deletedAt: { type: Date, default: null, select: false }
}, { timestamps: true, versionKey: false });
export default mongoose.model('Product', schema);
