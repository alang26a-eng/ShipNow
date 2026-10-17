import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createUserService } from '../src/services/user.service.js';
import { createProductService } from '../src/services/product.service.js';
import { createMockService } from '../src/services/mock.service.js';
import { createMockRepository } from '../src/repositories/mock.repository.js';
import { createRepository } from '../src/repositories/base.repository.js';
import { ERROR_DICTIONARY } from '../src/errors/error-dictionary.js';
import { UserNotFoundError, InvalidMockQuantityError } from '../src/errors/domain-errors.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import User from '../src/models/user.model.js';

const empty = { async list() { return []; }, async findById() { return null; } };
function api({ users = empty, products = empty, mocks, seedEnabled = true, generate } = {}) {
  return request(createApp({
    userService: createUserService(users), productService: createProductService(products),
    mockService: createMockService(mocks ?? { async insertDataset() { return { mode: 'transaction' }; } },
      { seedEnabled, nodeEnv: 'test', ...(generate ? { generate } : {}) })
  }));
}
function assertError(response, code) {
  const definition = ERROR_DICTIONARY[code];
  assert.equal(response.status, definition.status);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.deepEqual(Object.keys(response.body).sort(), ['error', 'status']);
  assert.equal(response.body.status, 'error');
  assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'details', 'message']);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, 'string');
  assert.ok(response.body.error.message.length > 0);
  assert.ok(response.body.error.details === null || typeof response.body.error.details === 'object');
  assert.ok(!JSON.stringify(response.body).includes('PRIVATE_DATABASE_SECRET'));
}

test('Los services lanzan errores del dominio antes de responder o persistir', async () => {
  await assert.rejects(createUserService(empty).get('000000000000000000000001'), UserNotFoundError);
  const service = createMockService({ insertDataset() { assert.fail('No debe escribir'); } },
    { seedEnabled: true, nodeEnv: 'test' });
  assert.throws(() => service.users({ qty: '-2' }), InvalidMockQuantityError);
  await assert.rejects(service.seed({ qty: '-2' }), InvalidMockQuantityError);
});

test('Usuarios, productos, estados, roles, IDs y rutas comparten el contrato de error', async () => {
  const http = api();
  const cases = [
    ['/api/users/000000000000000000000001', 'USER_NOT_FOUND'],
    ['/api/products/000000000000000000000001', 'PRODUCT_NOT_FOUND'],
    ['/api/users/invalid', 'INVALID_ID'],
    ['/api/products?status=INVALID', 'INVALID_STATUS'],
    ['/api/users?page=-1', 'VALIDATION_ERROR'],
    ['/unknown', 'ROUTE_NOT_FOUND'],
    ['/api/users/%E0%A4%A', 'INVALID_REQUEST']
  ];
  for (const [path, code] of cases) assertError(await http.get(path), code);
  assertError(await http.post('/api/users').send({ name: 'Ana', email: 'ana@example.com', role: 'INVALID' }), 'INVALID_ROLE');
  assertError(await http.post('/api/products').send({ name: 'Caja', price: -1, stock: 1 }), 'VALIDATION_ERROR');
});

test('JSON inválido, arrays y cuerpo demasiado grande también pasan por el middleware', async () => {
  const http = api();
  assertError(await http.post('/api/users').set('Content-Type', 'application/json').send('{'), 'INVALID_JSON');
  assertError(await http.post('/api/users').send([]), 'VALIDATION_ERROR');
  assertError(await http.post('/api/users').send({ name: 'a'.repeat(110000) }), 'PAYLOAD_TOO_LARGE');
});

test('Todos los previews rechazan cantidades inválidas con límites claros y sin escrituras', async () => {
  let writes = 0;
  const http = api({ mocks: { async insertDataset() { writes++; } } });
  for (const resource of ['users', 'drivers', 'orders', 'deliveries', 'scenario']) {
    for (const qty of ['-1', '0', '1.5', 'abc', '', '1001', '9007199254740992']) {
      const response = await http.get(`/api/mocks/${resource}`).query({ qty });
      assertError(response, 'INVALID_MOCK_QUANTITY');
      assert.deepEqual(response.body.error.details, { field: 'qty', min: 1, max: 1000 });
    }
  }
  assertError(await http.get('/api/mocks/users?qty=1&qty=2'), 'INVALID_MOCK_QUANTITY');
  assert.equal(writes, 0);
});

test('seed valida cantidades, recursos, parámetros y body sin tocar MongoDB', async () => {
  let writes = 0;
  const http = api({ mocks: { async insertDataset() { writes++; } } });
  for (const qty of ['-2', '0', '1.5', 'abc', '', '101'])
    assertError(await http.post('/api/mocks/seed').query({ qty }), 'INVALID_MOCK_QUANTITY');
  assertError(await http.post('/api/mocks/seed?qty=1&qty=2'), 'INVALID_MOCK_QUANTITY');
  assertError(await http.post('/api/mocks/seed?resource=invalid'), 'INVALID_MOCK_RESOURCE');
  assertError(await http.post('/api/mocks/seed?resource=all&resource=users'), 'INVALID_MOCK_RESOURCE');
  assertError(await http.post('/api/mocks/seed?unexpected=1'), 'VALIDATION_ERROR');
  assertError(await http.post('/api/mocks/seed').send({ qty: 5 }), 'VALIDATION_ERROR');
  assertError(await http.post('/api/mocks/seed').send([]), 'VALIDATION_ERROR');
  assertError(await api({ seedEnabled: false }).post('/api/mocks/seed?qty=1'), 'MOCK_SEED_DISABLED');
  assert.equal(writes, 0);
});

test('Una falla del generador se controla y nunca inicia la persistencia', async () => {
  const http = api({
    generate() { throw new Error('PRIVATE_DATABASE_SECRET'); },
    mocks: { insertDataset() { assert.fail('No debe escribir'); } }
  });
  assertError(await http.get('/api/mocks/users?qty=1'), 'MOCK_GENERATION_FAILED');
  assertError(await http.post('/api/mocks/seed?qty=1'), 'MOCK_GENERATION_FAILED');
});

function failingRepository({ topology, insertError, cleanupFails = false, invalidSchema = false, transactional = false } = {}) {
  const calls = [];
  class Model {
    constructor(row) { this.row = row; }
    async validate() { if (invalidSchema) await new User({}).validate(); }
    static async insertMany() { calls.push('insert'); throw insertError; }
    static async deleteMany() { calls.push('cleanup'); if (cleanupFails) throw new Error('PRIVATE_DATABASE_SECRET'); }
  }
  const connection = {
    readyState: 1,
    db: { admin: () => ({ async command() {
      if (topology) throw topology;
      return transactional ? { setName: 'rs0' } : {};
    } }) },
    async transaction(callback) { return callback({}); }
  };
  return { calls, repository: createMockRepository({
    UserModel: Model, OrderModel: Model, DeliveryModel: Model, connection
  }) };
}

test('Fallos de topología, red, índices, esquema e inserción tienen respuestas controladas', async () => {
  const failure = properties => Object.assign(new Error('PRIVATE_DATABASE_SECRET'), properties);
  const cases = [
    [{ topology: failure({ name: 'MongoNetworkError' }) }, 'DATABASE_UNAVAILABLE'],
    [{ insertError: failure({ name: 'MongoNetworkError' }) }, 'DATABASE_UNAVAILABLE'],
    [{ insertError: failure({ code: 11000 }) }, 'DUPLICATE_RESOURCE'],
    [{ invalidSchema: true }, 'VALIDATION_ERROR'],
    [{ insertError: failure({}) }, 'MOCK_PERSISTENCE_FAILED'],
    [{ insertError: failure({}), transactional: true }, 'MOCK_PERSISTENCE_FAILED'],
    [{ insertError: failure({}), cleanupFails: true }, 'MOCK_CLEANUP_FAILED']
  ];
  for (const [options, code] of cases) {
    const { repository, calls } = failingRepository(options);
    const response = await api({ mocks: repository }).post('/api/mocks/seed?qty=1&resource=all');
    assertError(response, code);
    if (code === 'MOCK_CLEANUP_FAILED') {
      assert.match(response.body.error.details.batchId, /^[0-9a-f-]{36}$/);
      assert.equal(calls.filter(call => call === 'cleanup').length, 3);
    }
    if (options.invalidSchema || options.topology) assert.equal(calls.length, 0);
  }
});

test('CRUD traduce errores reales del repositorio y oculta errores inesperados', async () => {
  for (const [properties, code] of [
    [{ code: 11000 }, 'DUPLICATE_RESOURCE'],
    [{ name: 'MongoServerSelectionError' }, 'DATABASE_UNAVAILABLE'],
    [{ name: 'CastError' }, 'INVALID_ID'],
    [{ status: 401 }, 'INTERNAL_ERROR']
  ]) {
    const repository = createRepository({ async create() {
      throw Object.assign(new Error('PRIVATE_DATABASE_SECRET'), properties);
    } }, {});
    assertError(await api({ users: repository }).post('/api/users')
      .send({ name: 'Ana', email: 'ana@example.com' }), code);
  }
});

test('Si los headers ya se enviaron, se delega a Express sin responder dos veces', () => {
  const failure = new Error('already sent');
  let forwarded;
  errorHandler(failure, {}, { headersSent: true, status() { assert.fail('No debe responder'); } }, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});
