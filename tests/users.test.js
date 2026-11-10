import { expect } from 'chai';
import { describe, it } from 'mocha';
import { absentId, api, createUser, expectApiError, expectRecord } from './support/fixtures.js';

describe('Usuarios', () => {
  it('GET /api/users lista usuarios con paginación y campos públicos', async () => {
    const first = await createUser();
    const second = await createUser({ name: 'Luis de prueba', email: 'luis@example.test', role: 'DRIVER' });
    const { body } = await api.get('/api/users?page=2&limit=1').expect(200).expect('Content-Type', /json/);
    expect(body).to.deep.equal({ data: [second] });
    expectRecord(body.data[0], { name: 'Luis de prueba', email: 'luis@example.test', role: 'DRIVER' });
    expect(second._id).not.to.equal(first._id);
  });

  it('GET /api/users rechaza una página inválida', async () => {
    await expectApiError(api.get('/api/users?page=0'), 400, 'VALIDATION_ERROR', {
      message: 'Paginación inválida.'
    });
  });

  it('POST /api/users normaliza el email, asigna el rol y rechaza duplicados', async () => {
    const input = { name: 'Ana de prueba', email: 'ANA@EXAMPLE.TEST' };
    const { body } = await api.post('/api/users').send(input).expect(201).expect('Content-Type', /json/);
    expect(body).to.have.all.keys('data');
    expectRecord(body.data, { ...input, email: 'ana@example.test', role: 'USER' });
    await expectApiError(api.post('/api/users').send(input), 409, 'DUPLICATE_RESOURCE');
  });

  it('consulta y modifica un usuario, y lo excluye tras la baja lógica', async () => {
    const user = await createUser();
    const route = '/api/users/' + user._id;
    const found = await api.get(route).expect(200);
    expect(found.body).to.deep.equal({ data: user });
    const updated = await api.patch(route).send({ name: 'Ana actualizada' }).expect(200);
    expect(updated.body).to.have.all.keys('data');
    expectRecord(updated.body.data, { name: 'Ana actualizada', email: user.email, role: 'USER' });
    expect(updated.body.data._id).to.equal(user._id);
    const removed = await api.delete(route).expect(204);
    expect(removed.text).to.equal('');
    await expectApiError(api.get(route), 404, 'USER_NOT_FOUND');
    await expectApiError(api.patch(route).send({ name: 'Otra' }), 404, 'USER_NOT_FOUND');
    await expectApiError(api.delete(route), 404, 'USER_NOT_FOUND');
    expect((await api.get('/api/users').expect(200)).body).to.deep.equal({ data: [] });
  });

  it('GET /api/users/:id distingue un ID mal formado de uno inexistente', async () => {
    await expectApiError(api.get('/api/users/invalido'), 400, 'INVALID_ID', { details: { field: 'id' } });
    await expectApiError(api.get('/api/users/' + absentId), 404, 'USER_NOT_FOUND');
  });
});
