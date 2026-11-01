import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildOpenApi } from '../src/docs/openapi.js';
import { createApp } from '../src/app.js';
const log = { log() {}, http() {}, debug() {}, info() {} };
test('OpenAPI válido, operaciones únicas, tags y esquemas reutilizables', async () => {
  const spec = buildOpenApi();
  await SwaggerParser.validate(structuredClone(spec));
  const ids = Object.values(spec.paths).flatMap(path => Object.values(path).filter(op => op.operationId).map(op => op.operationId));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 26);
  for (const tag of ['Users','Orders','Deliveries','Mocks','Logger']) assert.ok(spec.tags.some(t => t.name === tag));
  for (const schema of ['User','Order','Delivery','OrderItem','ErrorResponse','SuccessResponse']) assert.ok(spec.components.schemas[schema]);
});
test('Swagger UI, assets, JSON y contrato ajustado a módulos activos', async () => {
  const api = request(createApp({ log }));
  await api.get('/api/docs').expect(301);
  assert.match((await api.get('/api/docs/').expect(200)).text, /swagger-ui/);
  await api.get('/api/docs/swagger-ui.css').expect(200);
  await api.get('/api/docs/swagger-ui-bundle.js').expect(200);
  const spec = (await api.get('/api/docs.json').expect(200)).body;
  await SwaggerParser.validate(spec);
  for (const path of ['/api/mocks/seed','/api/logger-test','/api/orders','/api/deliveries']) assert.equal(spec.paths[path], undefined);
  await api.get('/api/logger-test').expect(404);
  await api.get('/api/mocks/users').expect(404);
});
