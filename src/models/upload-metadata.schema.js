import mongoose from 'mongoose';

export const uploadMetadataSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  documentType: { type: String, required: true },
  uploadedAt: { type: Date, required: true }
}, { _id: false });
