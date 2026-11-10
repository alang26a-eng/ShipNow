import { expect } from 'chai';
import { describe, it } from 'mocha';
import { absentId, api, createOrder, createUser, expectApiError, expectRecord } from './support/fixtures.js';

const deliveries = '/api/deliveries';

describe('Entregas', () => {
  it('crea, consulta y lista una entrega, y rechaza una segunda para el mismo pedido', async () => {
    const order = await createOrder();
    const input = { order: order._id };
    const { body } = await api.post(deliveries).send(input).expect(201).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expectRecord(body.data, { ...input, driver: null, status: 'PENDING', deliveredAt: null });
    expect((await api.get(deliveries + '/' + body.data._id).expect(200)).body).to.deep.equal(body);
    expect((await api.get(deliveries + '?status=PENDING').expect(200)).body).to.deep.equal({ data: [body.data] });
    await expectApiError(api.post(deliveries).send(input), 409, 'DUPLICATE_RESOURCE');
  });

  it('devuelve el 404 correspondiente al pedido o a la entrega inexistente', async () => {
    await expectApiError(api.post(deliveries).send({ order: absentId }), 404, 'ORDER_NOT_FOUND');
    await expectApiError(api.get(deliveries + '/' + absentId), 404, 'DELIVERY_NOT_FOUND');
    await expectApiError(api.patch(deliveries + '/' + absentId).send({ status: 'CANCELLED' }), 404, 'DELIVERY_NOT_FOUND');
  });

  it('valida el repartidor y la fecha al cambiar de estado', async () => {
    const order = await createOrder();
    const driver = await createUser({ email: 'driver@example.test', role: 'DRIVER' });
    const { body } = await api.post(deliveries).send({ order: order._id }).expect(201);
    const route = deliveries + '/' + body.data._id;
    await expectApiError(api.patch(route).send({ status: 'ASSIGNED' }), 400, 'VALIDATION_ERROR', {
      message: 'El estado requiere driver.'
    });
    await expectApiError(api.patch(route).send({ status: 'ASSIGNED', driver: order.user }), 400, 'VALIDATION_ERROR', {
      message: 'driver debe tener rol DRIVER.'
    });
    const assigned = await api.patch(route).send({ status: 'ASSIGNED', driver: driver._id }).expect(200);
    expect(assigned.body.data).to.include({ order: order._id, driver: driver._id, status: 'ASSIGNED' });
    await expectApiError(api.patch(route).send({ status: 'DELIVERED' }), 400, 'VALIDATION_ERROR', {
      message: 'DELIVERED requiere deliveredAt.'
    });
    const deliveredAt = '2026-11-01T15:00:00.000Z';
    const delivered = await api.patch(route).send({ status: 'DELIVERED', deliveredAt }).expect(200);
    expect(delivered.body).to.have.all.keys('data');
    expectRecord(delivered.body.data, { order: order._id, driver: driver._id, status: 'DELIVERED', deliveredAt });
    expect(delivered.body.data._id).to.equal(body.data._id);
    expect((await api.get(route).expect(200)).body).to.deep.equal(delivered.body);
    expect((await api.get('/api/orders/' + order._id).expect(200)).body).to.deep.equal({ data: order });
  });

  it('rechaza un estado de entrega fuera del catálogo', async () => {
    await expectApiError(api.get(deliveries + '?status=WRONG'), 400, 'INVALID_STATUS', {
      details: { field: 'status', allowed: ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] }
    });
  });
});
