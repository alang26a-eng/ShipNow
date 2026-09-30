import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepository } from '../src/repositories/base.repository.js';

test('Repositorio: filtro de baja, proyección, paginación y actualización validada', async () => {
  const calls = {};
  const chain = {};
  for (const method of ['select', 'sort', 'skip', 'limit']) chain[method] = value => { calls[method] = value; return chain; };
  chain.lean = async () => [];
  const model = {
    find(filter) { calls.filter = filter; return chain; },
    findOneAndUpdate(filter, update, options) { Object.assign(calls, { filter, update, options }); return chain; }
  };
  const projection = { _id: 1, name: 1 };
  const repository = createRepository(model, projection);
  await repository.list({ page: 2, limit: 10 }, { status: 'example' });
  assert.deepEqual(calls.filter, { status: 'example', deletedAt: null });
  assert.deepEqual(calls.select, projection);
  assert.equal(calls.skip, 10);
  assert.equal(calls.limit, 10);
  await repository.update('id', { name: 'New' });
  assert.deepEqual(calls.update, { $set: { name: 'New' } });
  assert.equal(calls.options.runValidators, true);
  assert.equal(calls.filter.deletedAt, null);
  await repository.remove('id');
  assert.ok(calls.update.$set.deletedAt instanceof Date);
});
test('Repositorio: traduce duplicados y oculta campos internos al crear', async () => {
  const duplicate = createRepository({ create: async () => { throw Object.assign(new Error(), { code: 11000 }); } }, {});
  await assert.rejects(duplicate.create({}), error => error.status === 409);
  const repository = createRepository({ create: async () => ({ _id: '1', name: 'Ana', deletedAt: null }) }, { _id: 1, name: 1 });
  assert.deepEqual(await repository.create({}), { _id: '1', name: 'Ana' });
});
