import mongoose from 'mongoose';
export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Esperar índices garantiza la unicidad de email desde la primera solicitud.
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}
export async function disconnectDatabase() { await mongoose.disconnect(); }
