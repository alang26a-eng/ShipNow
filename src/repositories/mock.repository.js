import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Order from '../models/order.model.js';
import Delivery from '../models/delivery.model.js';
import { AppError } from '../utils/app-error.js';
import { MockCleanupError, MockPersistenceError } from '../errors/domain-errors.js';
import { normalizePersistenceError } from '../errors/persistence-error.js';

export function createMockRepository({ UserModel = User, OrderModel = Order, DeliveryModel = Delivery,
  connection = mongoose.connection } = {}) {
  return {
    async insertDataset(dataset, batchId) {
      try {
        const batches = [
          { model: UserModel, rows: [...dataset.users, ...dataset.drivers] },
          { model: OrderModel, rows: dataset.orders },
          { model: DeliveryModel, rows: dataset.deliveries }
        ].filter(batch => batch.rows.length);
        for (const batch of batches) {
          batch.rows = batch.rows.map(row => ({ ...row, mockBatchId: batchId }));
          // Validar todos los esquemas antes de realizar la primera escritura.
          for (const row of batch.rows) await new batch.model(row).validate();
        }
        if (connection.readyState !== 1) throw new AppError('DATABASE_UNAVAILABLE');
        // También se controla un fallo al consultar la topología de MongoDB.
        const topology = await connection.db.admin().command({ hello: 1 });
        const transactional = Boolean(topology.setName || topology.msg === 'isdbgrid');
        async function insert(session) {
          for (const batch of batches)
            await batch.model.insertMany(batch.rows, { ordered: true, ...(session ? { session } : {}) });
        }
        if (transactional) {
          await connection.transaction(session => insert(session));
          return { mode: 'transaction' };
        }
        // MongoDB standalone no ofrece transacciones entre colecciones.
        try { await insert(); }
        catch (error) {
          let cleanupFailed = false;
          for (const batch of [...batches].reverse()) {
            try {
              await batch.model.deleteMany({
                mockBatchId: batchId, _id: { $in: batch.rows.map(row => row._id) }
              });
            } catch { cleanupFailed = true; }
          }
          if (cleanupFailed) throw new MockCleanupError(batchId, error);
          throw error;
        }
        return { mode: 'compensated' };
      } catch (error) {
        const normalized = normalizePersistenceError(error);
        if (normalized instanceof AppError) throw normalized;
        throw new MockPersistenceError(error);
      }
    }
  };
}

export default createMockRepository();
