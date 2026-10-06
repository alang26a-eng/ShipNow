import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { createMockService } from '../src/services/mock.service.js';
import { createMockRepository } from '../src/repositories/mock.repository.js';
import { createProductService } from '../src/services/product.service.js';
import { createUserService } from '../src/services/user.service.js';
import productRepository from '../src/repositories/product.repository.js';
import userRepository from '../src/repositories/user.repository.js';
import { generateDataset } from '../src/services/mock-generator.js';
import { MOCK_RESOURCES, USER_ROLES, DRIVER_REQUIRED_STATUSES } from '../src/constants/index.js';
import User from '../src/models/user.model.js';
import Order from '../src/models/order.model.js';
import Delivery from '../src/models/delivery.model.js';

function api() {
  return request(createApp({
    productService: createProductService(productRepository), userService: createUserService(userRepository),
    mockService: createMockService(createMockRepository(), { seedEnabled: true, nodeEnv: 'test' })
  }));
}
async function counts() {
  return Promise.all([User.countDocuments(), Order.countDocuments(), Delivery.countDocuments()]);
}
async function initialize(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection();
    await model.createIndexes();
  }
}

for (const transactional of [false, true]) {
  test(`MongoDB ${transactional ? 'replica set' : 'standalone'}: persistencia, referencias y rollback`, { timeout: 180000 }, async () => {
    const server = transactional
      ? await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, replSet: { count: 1, storageEngine: 'wiredTiger' } })
      : await MongoMemoryServer.create({ binary: { version: '7.0.24' } });
    try {
      await initialize(server.getUri('shipnow_test'));
      const http = api();
      const real = await User.create({ name: 'Usuario existente', email: 'real@example.com', role: USER_ROLES.USER });
      const before = await counts();
      for (const route of ['users', 'drivers', 'orders', 'deliveries', 'scenario'])
        await http.get(`/api/mocks/${route}?qty=5`).expect(200);
      assert.deepEqual(await counts(), before, 'Los GET no escriben documentos.');

      const basic = (await http.post('/api/mocks/seed?qty=10').expect(201)).body;
      assert.equal(basic.insertados, 10);
      const seeded = (await http.post('/api/mocks/seed?qty=8&resource=all').expect(201)).body;
      assert.equal(seeded.insertados, 32);
      assert.equal(seeded.persistencia, transactional ? 'transaction' : 'compensated');
      assert.deepEqual(await counts(), [27, 8, 8]);
      const orders = await Order.find({ mockBatchId: seeded.batchId }).populate('user').lean();
      for (const order of orders) assert.equal(order.user.role, USER_ROLES.USER);
      const deliveries = await Delivery.find({ mockBatchId: seeded.batchId }).populate('order').populate('driver').lean();
      for (const delivery of deliveries) {
        assert.ok(delivery.order);
        if (DRIVER_REQUIRED_STATUSES.includes(delivery.status)) assert.equal(delivery.driver?.role, USER_ROLES.DRIVER);
        else assert.equal(delivery.driver, null);
      }
      await http.get('/api/users').expect(200);
      await http.post('/api/mocks/seed?qty=1&resource=all').expect(201);
      assert.deepEqual(await counts(), [29, 9, 9], 'Cada llamada agrega su propio lote.');

      const beforeFailure = await counts();
      const brokenDataset = generateDataset(MOCK_RESOURCES.ALL, 5);
      // Esquema válido, pero índice único de MongoDB rechaza la inserción de deliveries.
      // Esto fuerza un error después de escribir usuarios y pedidos.
      brokenDataset.deliveries[1].order = brokenDataset.deliveries[0].order;
      await assert.rejects(createMockRepository().insertDataset(brokenDataset, 'failed-batch'), error => error.status === 409);
      assert.deepEqual(await counts(), beforeFailure, 'No quedan registros del lote fallido.');
      assert.ok(await User.findById(real._id), 'No se borran datos anteriores.');
      assert.equal(await User.countDocuments({ mockBatchId: 'failed-batch' }), 0);
      assert.equal(await Order.countDocuments({ mockBatchId: 'failed-batch' }), 0);
      assert.equal(await Delivery.countDocuments({ mockBatchId: 'failed-batch' }), 0);

      const invalid = generateDataset(MOCK_RESOURCES.ALL, 3);
      invalid.orders[0].priority = 'INVALID';
      await assert.rejects(createMockRepository().insertDataset(invalid, 'invalid-batch'), error => error.status === 400);
      assert.deepEqual(await counts(), beforeFailure, 'Se validan todos los esquemas antes de insertar.');
    } finally {
      await mongoose.disconnect();
      await server.stop();
    }
  });
}
