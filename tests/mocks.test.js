import { expect } from 'chai';
import { describe, it } from 'mocha';
import mongoose from 'mongoose';
import { api, createTestApi, createUser, expectApiError, objectId, uuid } from './support/fixtures.js';

const root = '/api/mocks';

function expectMockUser(user, role) {
  expect(user).to.have.all.keys('_id', 'name', 'email', 'role');
  expect(user._id).to.match(objectId);
  expect(user.name).to.be.a('string').and.not.be.empty;
  expect(user.email).to.equal('mock.' + user._id + '@test.com');
  expect(user.role).to.equal(role);
}

async function persistedCounts(filter = {}) {
  return Promise.all(['User', 'Order', 'Delivery'].map(name => mongoose.model(name).countDocuments(filter)));
}

describe('Mocks', () => {
  for (const [resource, roles] of [['users', ['USER', 'DRIVER']], ['drivers', ['DRIVER', 'DRIVER']]]) {
    it('GET ' + resource + ' devuelve usuarios del rol esperado sin persistirlos', async () => {
      const { body } = await api.get(root + '/' + resource + '?qty=2').expect(200).expect('Content-Type', /json/);
      expect(body).to.be.an('array').with.lengthOf(2);
      body.forEach((user, index) => expectMockUser(user, roles[index]));
      expect(new Set(body.map(user => user._id)).size).to.equal(2);
      expect(await persistedCounts()).to.deep.equal([0, 0, 0]);
    });
  }

  for (const resource of ['orders', 'deliveries', 'scenario']) {
    it('GET ' + resource + ' devuelve un conjunto de datos relacionado sin persistirlo', async () => {
      const { body } = await api.get(root + '/' + resource + '?qty=5').expect(200).expect('Content-Type', /json/);
      expect(body).to.have.all.keys('users', 'drivers', 'orders', 'deliveries');
      expect(body.users).to.have.lengthOf(5);
      expect(body.orders).to.have.lengthOf(5);
      const withDeliveries = resource !== 'orders';
      expect(body.drivers).to.have.lengthOf(withDeliveries ? 5 : 0);
      expect(body.deliveries).to.have.lengthOf(withDeliveries ? 5 : 0);
      body.users.forEach(user => expectMockUser(user, 'USER'));
      body.drivers.forEach(driver => expectMockUser(driver, 'DRIVER'));
      for (const order of body.orders) {
        expect(order).to.have.all.keys('_id', 'user', 'status', 'priority', 'description', 'pickupAddress', 'deliveryAddress', 'weightKg');
        expect(order._id).to.match(objectId);
        expect(body.users.map(user => user._id)).to.include(order.user);
        expect(order.weightKg).to.be.a('number').and.greaterThan(0);
        expect(order.priority).to.be.oneOf(['LOW', 'NORMAL', 'HIGH']);
      }
      expect(body.orders.map(order => order.status)).to.have.members(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
      for (const delivery of body.deliveries) {
        expect(delivery).to.have.all.keys('_id', 'order', 'driver', 'status', 'deliveredAt');
        expect(delivery._id).to.match(objectId);
        const order = body.orders.find(item => item._id === delivery.order);
        expect(order).to.exist;
        expect(delivery.status).to.equal(order.status);
        if (['ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].includes(delivery.status)) {
          expect(body.drivers.map(driver => driver._id)).to.include(delivery.driver);
        } else {
          expect(delivery.driver).to.equal(null);
        }
        if (delivery.status === 'DELIVERED') {
          expect(delivery.deliveredAt).to.be.a('string');
          expect(new Date(delivery.deliveredAt).toISOString()).to.equal(delivery.deliveredAt);
        } else {
          expect(delivery.deliveredAt).to.equal(null);
        }
      }
      expect(await persistedCounts()).to.deep.equal([0, 0, 0]);
    });
  }

  for (const [resource, query] of [
    ['users', 'qty=0'], ['drivers', 'qty=-1'], ['orders', 'qty=1.5'],
    ['deliveries', 'qty=abc'], ['scenario', 'qty=1001'], ['users', 'qty=1&qty=2']
  ]) {
    it('GET ' + resource + ' rechaza ' + query, async () => {
      await expectApiError(api.get(root + '/' + resource + '?' + query), 400, 'INVALID_MOCK_QUANTITY', {
        details: { field: 'qty', min: 1, max: 1000 }
      });
      expect(await persistedCounts()).to.deep.equal([0, 0, 0]);
    });
  }

  it('POST seed inserta el lote completo sin reemplazar usuarios previos', async () => {
    const user = await createUser();
    const { body } = await api.post(root + '/seed?qty=2&resource=all').expect(201).expect('Content-Type', /json/);
    expect(body).to.deep.equal({
      insertados: 8, colecciones: { usuarios: 4, pedidos: 2, entregas: 2 },
      repartidores: 2, persistencia: 'compensated', batchId: body.batchId
    });
    expect(body.batchId).to.match(uuid);
    expect(await persistedCounts({ mockBatchId: body.batchId })).to.deep.equal([4, 2, 2]);
    expect(await persistedCounts()).to.deep.equal([5, 2, 2]);
    expect((await api.get('/api/users/' + user._id).expect(200)).body).to.deep.equal({ data: user });
  });

  it('POST seed rechaza cantidades, recursos y cuerpos inválidos sin escribir datos', async () => {
    await expectApiError(api.post(root + '/seed?qty=101'), 400, 'INVALID_MOCK_QUANTITY', {
      details: { field: 'qty', min: 1, max: 100 }
    });
    await expectApiError(api.post(root + '/seed?resource=invalido'), 400, 'INVALID_MOCK_RESOURCE', {
      details: { field: 'resource', allowed: ['users', 'drivers', 'orders', 'deliveries', 'all'] }
    });
    await expectApiError(api.post(root + '/seed').send({ qty: 2 }), 400, 'VALIDATION_ERROR', {
      message: 'seed recibe qty y resource por query; no admite datos en el body.'
    });
    expect(await persistedCounts()).to.deep.equal([0, 0, 0]);
  });

  it('POST seed devuelve 403 con la carga deshabilitada', async () => {
    const disabled = createTestApi({ mockSeedEnabled: false });
    await expectApiError(disabled.post(root + '/seed?qty=1'), 403, 'MOCK_SEED_DISABLED');
    expect(await persistedCounts()).to.deep.equal([0, 0, 0]);
  });
});
