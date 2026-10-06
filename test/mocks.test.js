import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createMockService } from '../src/services/mock.service.js';
import { createProductService } from '../src/services/product.service.js';
import { createUserService } from '../src/services/user.service.js';
import { generateDataset } from '../src/services/mock-generator.js';
import {
  USER_ROLES, ORDER_PRIORITIES, ORDER_STATUSES, DELIVERY_STATUS_BY_ORDER,
  DRIVER_REQUIRED_STATUSES, MOCK_RESOURCES
} from '../src/constants/index.js';
import User from '../src/models/user.model.js';
import Order from '../src/models/order.model.js';
import Delivery from '../src/models/delivery.model.js';

function setup({ seedEnabled = true, nodeEnv = 'test', mocksEnabled = true } = {}) {
  const writes = [];
  const repository = { async insertDataset(dataset, batchId) {
    writes.push({ dataset, batchId }); return { mode: 'transaction' };
  } };
  const empty = { async list() { return []; } };
  const app = createApp({
    productService: createProductService(empty), userService: createUserService(empty),
    mockService: createMockService(repository, { seedEnabled, nodeEnv }), mocksEnabled
  });
  return { api: request(app), writes };
}

export function assertRelationships(dataset) {
  const users = new Map(dataset.users.map(user => [user._id, user]));
  const drivers = new Map(dataset.drivers.map(driver => [driver._id, driver]));
  const orders = new Map(dataset.orders.map(order => [order._id, order]));
  assert.ok([...drivers.values()].every(driver => driver.role === USER_ROLES.DRIVER));
  for (const order of orders.values()) {
    assert.equal(users.get(order.user)?.role, USER_ROLES.USER);
    assert.ok(Object.values(ORDER_STATUSES).includes(order.status));
    assert.ok(Object.values(ORDER_PRIORITIES).includes(order.priority));
  }
  for (const delivery of dataset.deliveries) {
    const order = orders.get(delivery.order);
    assert.ok(order);
    assert.equal(delivery.status, DELIVERY_STATUS_BY_ORDER[order.status]);
    if (DRIVER_REQUIRED_STATUSES.includes(delivery.status))
      assert.equal(drivers.get(delivery.driver)?.role, USER_ROLES.DRIVER);
    else assert.equal(delivery.driver, null);
  }
  assert.equal(new Set(dataset.deliveries.map(delivery => delivery.order)).size, dataset.deliveries.length);
}

test('Los GET devuelven la cantidad solicitada y jamás llaman al repositorio', async () => {
  const { api, writes } = setup();
  const users = (await api.get('/api/mocks/users?qty=2').expect(200)).body;
  assert.equal(users.length, 2);
  assert.ok(users.every(user => Object.values(USER_ROLES).includes(user.role)));
  const drivers = (await api.get('/api/mocks/drivers?qty=3').expect(200)).body;
  assert.equal(drivers.length, 3);
  assert.ok(drivers.every(driver => driver.role === USER_ROLES.DRIVER));
  for (const path of ['orders', 'deliveries', 'scenario']) {
    const dataset = (await api.get(`/api/mocks/${path}?qty=10`).expect(200)).body;
    assert.equal(dataset.orders.length, 10);
    assert.equal(dataset.deliveries.length, path === 'orders' ? 0 : 10);
    assertRelationships(dataset);
  }
  assert.equal((await api.get('/api/mocks/users').expect(200)).body.length, 10);
  assert.equal(writes.length, 0);
});

test('Los mocks cumplen los esquemas reales y no repiten IDs o emails entre llamadas', async () => {
  const first = generateDataset(MOCK_RESOURCES.ALL, 100);
  const second = generateDataset(MOCK_RESOURCES.ALL, 100);
  assertRelationships(first);
  const allUsers = [...first.users, ...first.drivers, ...second.users, ...second.drivers];
  assert.equal(new Set(allUsers.map(user => user.email)).size, 400);
  const rows = [...Object.values(first).flat(), ...Object.values(second).flat()];
  assert.equal(new Set(rows.map(row => row._id)).size, rows.length);
  for (const row of [...first.users, ...first.drivers]) await new User(row).validate();
  for (const row of first.orders) await new Order(row).validate();
  for (const row of first.deliveries) await new Delivery(row).validate();
});

test('qty rechaza entradas ambiguas, duplicadas, fuera de rango y queries desconocidas', async () => {
  const { api, writes } = setup();
  for (const qty of ['0', '-1', '1.5', 'abc', '', '1001', '1e2', '999999999999999999999'])
    await api.get('/api/mocks/users').query({ qty }).expect(400);
  await api.get('/api/mocks/users?qty=1&qty=2').expect(400);
  await api.get('/api/mocks/users?typo=3').expect(400);
  await api.get('/api/mocks/users?qty=1000').expect(200);
  assert.equal(writes.length, 0);
});

test('seed por defecto inserta solo qty usuarios; seed all incluye todas las dependencias', async () => {
  const { api, writes } = setup();
  const basic = (await api.post('/api/mocks/seed?qty=10').expect(201)).body;
  assert.equal(basic.insertados, 10);
  assert.equal(basic.coleccion, 'usuarios');
  assert.equal(writes[0].dataset.users.length, 10);
  const all = (await api.post('/api/mocks/seed?qty=5&resource=all').expect(201)).body;
  assert.equal(all.insertados, 20);
  assert.deepEqual(all.colecciones, { usuarios: 10, pedidos: 5, entregas: 5 });
  assert.equal(all.repartidores, 5);
  assertRelationships(writes[1].dataset);
  assert.notEqual(writes[0].batchId, writes[1].batchId);
  const drivers = (await api.post('/api/mocks/seed?qty=2&resource=drivers').expect(201)).body;
  assert.equal(drivers.insertados, 2);
  assert.equal(drivers.repartidores, 2);
  const orders = (await api.post('/api/mocks/seed?qty=3&resource=orders').expect(201)).body;
  assert.equal(orders.insertados, 6);
  assertRelationships(writes[3].dataset);
});

test('seed valida el límite y resource antes de escribir, y rechaza datos arbitrarios', async () => {
  const { api, writes } = setup();
  for (const path of ['qty=101', 'qty=0', 'resource=invalid', 'resource=all&resource=users', 'qty=1&unexpected=1'])
    await api.post('/api/mocks/seed?' + path).expect(400);
  await api.post('/api/mocks/seed').send({ role: USER_ROLES.ADMIN }).expect(400);
  await api.post('/api/mocks/seed').send([]).expect(400);
  assert.equal(writes.length, 0);
});

test('seed requiere habilitación explícita; producción y router apagado no permiten carga', async () => {
  for (const config of [{ seedEnabled: false }, { nodeEnv: 'production' }]) {
    const { api, writes } = setup(config);
    await api.post('/api/mocks/seed?qty=1').expect(403);
    await api.get('/api/mocks/users?qty=1').expect(200);
    assert.equal(writes.length, 0);
  }
  const { api, writes } = setup({ mocksEnabled: false });
  await api.get('/api/mocks/users').expect(404);
  await api.post('/api/mocks/seed').expect(404);
  assert.equal(writes.length, 0);
});
