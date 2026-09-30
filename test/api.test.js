import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createProductService } from '../src/services/product.service.js';
import { createUserService } from '../src/services/user.service.js';
import { PRODUCT_STATUSES, USER_ROLES } from '../src/constants/index.js';
import { AppError } from '../src/utils/app-error.js';

function memoryRepository() {
  const rows = new Map();
  let counter = 0;
  return {
    async list({ page, limit }, filters = {}) { return [...rows.values()].filter(row =>
      Object.entries(filters).every(([key, value]) => row[key] === value)).slice((page - 1) * limit, page * limit); },
    async findById(id) { return rows.get(id) ?? null; },
    async create(data) {
      if (data.email && [...rows.values()].some(row => row.email === data.email)) throw new AppError(409, 'Email duplicado.');
      const row = { _id: (++counter).toString(16).padStart(24, '0'), ...data };
      rows.set(row._id, row); return row;
    },
    async update(id, data) { if (!rows.has(id)) return null; const row = { ...rows.get(id), ...data }; rows.set(id, row); return row; },
    async remove(id) { const row = rows.get(id); rows.delete(id); return row; }
  };
}
function setup() {
  return createApp({ productService: createProductService(memoryRepository()), userService: createUserService(memoryRepository()) });
}
test('Products: CRUD HTTP, estados derivados, filtros y baja', async () => {
  const api = request(setup());
  const created = await api.post('/api/products').send({ name: 'Caja', price: 25, stock: 3 }).expect(201);
  const id = created.body.data._id;
  assert.equal(created.body.data.status, PRODUCT_STATUSES.AVAILABLE);
  await api.get('/api/products/' + id).expect(200);
  const updated = await api.patch('/api/products/' + id).send({ stock: 0 }).expect(200);
  assert.equal(updated.body.data.status, PRODUCT_STATUSES.OUT_OF_STOCK);
  const filtered = await api.get('/api/products?status=' + PRODUCT_STATUSES.AVAILABLE).expect(200);
  assert.equal(filtered.body.data.length, 0);
  await api.delete('/api/products/' + id).expect(204);
  await api.get('/api/products/' + id).expect(404);
});
test('Products: rechaza precio, stock, estado manual, IDs y paginación inválidos', async () => {
  const api = request(setup());
  for (const body of [{ name: 'A', price: -1, stock: 1 }, { name: 'A', price: 1, stock: 1.5 },
    { name: 'A', price: 1, stock: 1, status: PRODUCT_STATUSES.AVAILABLE }, {}]) {
    await api.post('/api/products').send(body).expect(400);
  }
  await api.get('/api/products/bad-id').expect(400);
  await api.get('/api/products?limit=101').expect(400);
  await api.get('/api/products?status=invalid').expect(400);
});
test('Users: CRUD HTTP, normalización, rol por defecto y email duplicado', async () => {
  const api = request(setup());
  const created = await api.post('/api/users').send({ name: ' Ana ', email: 'ANA@example.com' }).expect(201);
  const user = created.body.data;
  assert.equal(user.email, 'ana@example.com');
  assert.equal(user.role, USER_ROLES.USER);
  await api.post('/api/users').send({ name: 'Ana', email: user.email }).expect(409);
  await api.get('/api/users/' + user._id).expect(200);
  await api.patch('/api/users/' + user._id).send({ role: USER_ROLES.ADMIN }).expect(200);
  await api.get('/api/users').expect(200);
  await api.delete('/api/users/' + user._id).expect(204);
  await api.get('/api/users/' + user._id).expect(404);
});
test('Users: validación y HTTP: errores comunes', async () => {
  const api = request(setup());
  await api.post('/api/users').send({ name: 'Ana', email: 'invalid' }).expect(400);
  await api.post('/api/users').send({ name: 'Ana', email: 'a@example.com', role: 'invalid' }).expect(400);
  await api.patch('/api/users/000000000000000000000001').send({}).expect(400);
  await api.post('/api/users').set('Content-Type', 'application/json').send('{').expect(400);
  await api.get('/missing').expect(404);
  await api.get('/health').expect(200);
});
test('Errores inesperados no exponen detalles internos', async () => {
  const broken = memoryRepository();
  broken.list = async () => { throw new Error('secret database detail'); };
  const app = createApp({ productService: createProductService(broken), userService: createUserService(memoryRepository()) });
  const result = await request(app).get('/api/products').expect(500);
  assert.equal(result.body.error, 'Error interno del servidor.');
});
