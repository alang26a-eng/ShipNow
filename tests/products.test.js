import { expect } from 'chai';
import { describe, it } from 'mocha';
import { api, expectApiError, expectRecord } from './support/fixtures.js';

const products = '/api/products';

describe('Productos', () => {
  it('crea, consulta, actualiza, filtra y elimina un producto según OpenAPI', async () => {
    const input = { name: 'Caja de prueba', stock: 2, price: 750 };
    const { body } = await api.post(products).send(input).expect(201).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expectRecord(body.data, { ...input, status: 'AVAILABLE' });
    const route = products + '/' + body.data._id;
    expect((await api.get(route).expect(200)).body).to.deep.equal(body);

    const updated = await api.patch(route).send({ stock: 0 }).expect(200);
    expect(updated.body).to.have.all.keys('data');
    expectRecord(updated.body.data, { ...input, stock: 0, status: 'OUT_OF_STOCK' });
    expect(updated.body.data._id).to.equal(body.data._id);
    expect((await api.get(products + '?status=AVAILABLE').expect(200)).body).to.deep.equal({ data: [] });
    expect((await api.get(products + '?status=OUT_OF_STOCK').expect(200)).body)
      .to.deep.equal({ data: [updated.body.data] });

    expect((await api.delete(route).expect(204)).text).to.equal('');
    await expectApiError(api.get(route), 404, 'PRODUCT_NOT_FOUND');
    await expectApiError(api.patch(route).send({ stock: 1 }), 404, 'PRODUCT_NOT_FOUND');
    await expectApiError(api.delete(route), 404, 'PRODUCT_NOT_FOUND');
  });

  it('acepta el estado como filtro y rechaza escribirlo en el cuerpo', async () => {
    await expectApiError(api.get(products + '?status=WRONG'), 400, 'INVALID_STATUS', {
      details: { field: 'status', allowed: ['AVAILABLE', 'OUT_OF_STOCK'] }
    });
    await expectApiError(api.post(products).send({ name: 'Caja de prueba', stock: 0, price: 750, status: 'AVAILABLE' }),
      400, 'VALIDATION_ERROR', { message: 'Hay campos no permitidos.' });
  });
});
