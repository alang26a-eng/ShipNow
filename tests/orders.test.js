import { expect } from 'chai';
import { describe, it } from 'mocha';
import { absentId, api, createOrder, expectApiError, expectRecord, orderInput } from './support/fixtures.js';

const orders = '/api/orders';
const statusDetails = { field: 'status', allowed: ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] };

describe('Pedidos', () => {
  it('GET /api/orders lista pedidos y filtra por estado', async () => {
    const input = await orderInput();
    const pending = await createOrder(input);
    await createOrder({ ...input, status: 'CANCELLED' });
    const { body } = await api.get(orders).expect(200).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expect(body.data.map(order => order.status)).to.deep.equal(['PENDING', 'CANCELLED']);
    expectRecord(body.data[0], { ...input, status: 'PENDING', priority: 'NORMAL' });
    const filtered = await api.get(orders + '?status=PENDING').expect(200);
    expect(filtered.body).to.deep.equal({ data: [pending] });
  });

  it('GET /api/orders rechaza un filtro de estado inválido', async () => {
    await expectApiError(api.get(orders + '?status=WRONG'), 400, 'INVALID_STATUS', { details: statusDetails });
  });

  it('POST /api/orders crea un pedido con cliente, ítems y valores por defecto', async () => {
    const input = await orderInput();
    const { body } = await api.post(orders).send(input).expect(201).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expectRecord(body.data, { ...input, status: 'PENDING', priority: 'NORMAL' });
    const persisted = await api.get(orders + '/' + body.data._id).expect(200);
    expect(persisted.body).to.deep.equal(body);
  });

  it('POST /api/orders rechaza un pedido incompleto sin crear registros', async () => {
    const { weightKg, ...incomplete } = await orderInput();
    await expectApiError(api.post(orders).send(incomplete), 400, 'VALIDATION_ERROR', {
      message: 'weightKg debe ser mayor o igual a 0.01.'
    });
    expect((await api.get(orders).expect(200)).body).to.deep.equal({ data: [] });
  });

  it('POST /api/orders rechaza ítems inválidos y clientes inexistentes', async () => {
    const input = await orderInput();
    await expectApiError(api.post(orders).send({ ...input, items: [{ description: 'Libro', quantity: 0 }] }),
      400, 'VALIDATION_ERROR', { message: 'quantity debe ser un entero positivo.' });
    await expectApiError(api.post(orders).send({ ...input, user: absentId }), 404, 'USER_NOT_FOUND');
  });

  it('GET /api/orders/:id devuelve el pedido solicitado', async () => {
    const order = await createOrder();
    const { body } = await api.get(orders + '/' + order._id).expect(200).expect('Content-Type', /json/);
    expect(body).to.deep.equal({ data: order });
    expect(body.data).to.include({ description: 'Caja de libros', status: 'PENDING' });
  });

  it('GET /api/orders/:id distingue un ID mal formado de uno inexistente', async () => {
    await expectApiError(api.get(orders + '/invalido'), 400, 'INVALID_ID', { details: { field: 'id' } });
    await expectApiError(api.get(orders + '/' + absentId), 404, 'ORDER_NOT_FOUND');
  });

  it('PATCH /api/orders/:id persiste el nuevo estado y conserva los demás datos', async () => {
    const order = await createOrder();
    const route = orders + '/' + order._id;
    const { body } = await api.patch(route).send({ status: 'IN_TRANSIT' }).expect(200).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expect(body.data).to.deep.equal({ ...order, updatedAt: body.data.updatedAt, status: 'IN_TRANSIT' });
    expect((await api.get(route).expect(200)).body).to.deep.equal(body);
  });

  it('PATCH /api/orders/:id rechaza un estado inválido y conserva el pedido', async () => {
    const order = await createOrder();
    const route = orders + '/' + order._id;
    await expectApiError(api.patch(route).send({ status: 'WRONG' }), 400, 'INVALID_STATUS', { details: statusDetails });
    expect((await api.get(route).expect(200)).body).to.deep.equal({ data: order });
    await expectApiError(api.patch(orders + '/' + absentId).send({ status: 'CANCELLED' }), 404, 'ORDER_NOT_FOUND');
  });
});
