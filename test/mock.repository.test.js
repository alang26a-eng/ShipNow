import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockRepository } from '../src/repositories/mock.repository.js';
import { generateDataset } from '../src/services/mock-generator.js';
import { MOCK_RESOURCES } from '../src/constants/index.js';

function fixture({ transactional = false, cleanupFails = false } = {}) {
  const collections = [new Map([['existing', { _id: 'existing', mockBatchId: 'other' }]]), new Map(), new Map()];
  const makeModel = (index, fail = false) => class {
    constructor(row) { this.row = row; }
    async validate() { if (this.row.invalid) { const error = new Error('Invalid'); error.name = 'ValidationError'; throw error; } }
    static async insertMany(rows) {
      for (const row of rows) {
        collections[index].set(row._id, row);
        if (fail) { const error = new Error('Duplicate'); error.code = 11000; throw error; }
      }
    }
    static async deleteMany(filter) {
      if (cleanupFails && index === 2) throw new Error('Unavailable');
      for (const id of filter._id.$in)
        if (collections[index].get(id)?.mockBatchId === filter.mockBatchId) collections[index].delete(id);
    }
  };
  const connection = {
    readyState: 1, db: { admin: () => ({ command: async () => transactional ? { setName: 'rs0' } : {} }) },
    async transaction(callback) {
      const snapshots = collections.map(rows => new Map(rows));
      try { return await callback({}); }
      catch (error) {
        collections.forEach((rows, index) => { rows.clear(); for (const [id, row] of snapshots[index]) rows.set(id, row); });
        throw error;
      }
    }
  };
  return {
    collections, connection,
    repository: createMockRepository({ UserModel: makeModel(0), OrderModel: makeModel(1), DeliveryModel: makeModel(2, true), connection })
  };
}

for (const transactional of [false, true]) {
  test(`Lote fallido ${transactional ? 'transaccional' : 'standalone'} conserva documentos previos y revierte los nuevos`, async () => {
    const { repository, collections } = fixture({ transactional });
    await assert.rejects(repository.insertDataset(generateDataset(MOCK_RESOURCES.ALL, 5), 'failed'), error => error.status === 409);
    assert.deepEqual(collections.map(rows => rows.size), [1, 0, 0]);
    assert.ok(collections[0].has('existing'));
  });
}

test('Si falla la limpieza, se informa el lote y se intenta limpiar las otras colecciones', async () => {
  const { repository, collections } = fixture({ cleanupFails: true });
  await assert.rejects(repository.insertDataset(generateDataset(MOCK_RESOURCES.ALL, 5), 'failed'), error => error.status === 503 && error.message.includes('failed'));
  assert.equal(collections[0].size, 1);
  assert.equal(collections[1].size, 0);
});

test('Validación previa y conexión no disponible impiden escribir', async () => {
  const { repository, collections, connection } = fixture();
  const invalid = generateDataset(MOCK_RESOURCES.ALL, 5);
  invalid.orders[4].invalid = true;
  await assert.rejects(repository.insertDataset(invalid, 'invalid'), error => error.status === 400);
  assert.deepEqual(collections.map(rows => rows.size), [1, 0, 0]);
  connection.readyState = 0;
  await assert.rejects(repository.insertDataset(generateDataset(MOCK_RESOURCES.ALL, 5), 'offline'), error => error.status === 503);
  assert.deepEqual(collections.map(rows => rows.size), [1, 0, 0]);
});
