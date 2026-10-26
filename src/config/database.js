import mongoose from 'mongoose';
import logger from './logger.js';
export async function connectDatabase(uri, { log = logger, connection = mongoose } = {}) {
 try {
  await connection.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Esperar índices garantiza la unicidad de email desde la primera solicitud.
  await Promise.all(Object.values(connection.models).map(model => model.init()));
  log.info('Conexión a MongoDB establecida');
 } catch (error) {
  log.fatal('Falló la conexión inicial o la creación de índices de MongoDB', { error });
  throw error;
 }
}
export async function disconnectDatabase() { await mongoose.disconnect(); }
