import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import request from 'supertest';
import winston from 'winston';
import { createLogger, closeLogger, LOG_LEVELS } from '../src/config/logger.js';
import { createApp } from '../src/app.js';
import { validateEnv } from '../src/config/env.config.js';
import { connectDatabase } from '../src/config/database.js';
import { createMockService } from '../src/services/mock.service.js';
import { createUserService } from '../src/services/user.service.js';

function spyLogger() {
  const entries = [];
  const log = { entries, log(level, message, meta) { entries.push({ level, message, ...meta }); } };
  for (const level of Object.keys(LOG_LEVELS)) log[level] = (message, meta) => log.log(level, message, meta);
  return log;
}
const empty = { list: async () => [], findById: async () => null };
function app(log, options = {}) {
  return createApp({ userService: createUserService(empty, { log }), productService: empty,
    mockService: createMockService({}, { log, nodeEnv: 'test' }), log,
    nodeEnv: 'development', loggerTestEnabled: true, ...options });
}

test('Consola: debug en desarrollo, info en producción y seis niveles personalizados', async () => {
  assert.deepEqual(Object.keys(LOG_LEVELS), ['fatal', 'error', 'warning', 'info', 'http', 'debug']);
  for (const [nodeEnv, level] of [['development', 'debug'], ['production', 'info']]) {
    const logger = createLogger({ nodeEnv, fileEnabled: false });
    assert.equal(logger.transports[0].level, level);
    assert.equal(logger.isLevelEnabled('debug'), nodeEnv === 'development');
    assert.equal(logger.isLevelEnabled('http'), nodeEnv === 'development');
    assert.equal(logger.isLevelEnabled('fatal'), true);
    await closeLogger(logger);
  }
});

test('Formato con timestamp, nivel y mensaje; sanitiza secretos, URI y saltos de línea', async () => {
  let output = '';
  const logger = createLogger({ nodeEnv: 'test' });
  const stream = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
  logger.add(new winston.transports.Stream({ stream, level: 'debug' }));
  logger.info('Evento\ninyectado', { password: 'hidden-password', nested: { token: 'hidden-token' },
    error: new Error('Fallo mongodb://admin:hidden-uri@localhost/shipnow') });
  await closeLogger(logger);
  assert.match(output, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[info\] Evento\\ninyectado/);
  assert.equal(output.trim().split('\n').length, 1);
  for (const secret of ['hidden-password', 'hidden-token', 'hidden-uri', 'mongodb://']) assert.ok(!output.includes(secret));
  assert.ok(output.includes('REDACTED'));
});

test('error.log persiste únicamente error y fatal, incluso en producción', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shipnow-logs-'));
  try {
    const logger = createLogger({ nodeEnv: 'production', consoleEnabled: false, fileEnabled: true, logDir: directory });
    for (const level of ['debug', 'http', 'info', 'warning', 'error', 'fatal']) logger.log(level, `Prueba ${level}`);
    await closeLogger(logger);
    const lines = (await readFile(join(directory, 'error.log'), 'utf8')).trim().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /\[error\] Prueba error/);
    assert.match(lines[1], /\[fatal\] Prueba fatal/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Rotación real por tamaño conserva un número acotado de archivos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shipnow-rotation-'));
  try {
    // Reiniciar simula varias ejecuciones y comprueba que se conserva la política de retención.
    for (let batch = 0; batch < 8; batch++) {
      const logger = createLogger({ nodeEnv: 'test', fileEnabled: true, logDir: directory, maxSize: 200, maxFiles: 3 });
      logger.error(`Lote ${batch} ` + 'x'.repeat(180));
      await closeLogger(logger);
    }
    const files = (await readdir(directory)).filter(name => /^error\d*\.log$/.test(name));
    assert.ok(files.length >= 2 && files.length <= 3, files.join(', '));
    const content = (await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')))).join('');
    assert.match(content, /Lote 7/);
    assert.ok(!content.includes('Lote 0'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Endpoint dispara los seis niveles y no existe en producción o cuando se deshabilita', async () => {
  const log = spyLogger();
  const response = await request(app(log)).get('/api/logger-test');
  assert.equal(response.status, 200);
  assert.deepEqual(log.entries.filter(e => e.event === 'logger_test').map(e => e.level),
    ['debug', 'http', 'info', 'warning', 'error', 'fatal']);
  assert.equal(response.body.requestId, response.headers['x-request-id']);
  assert.ok(log.entries.some(e => e.level === 'http' && e.status === 200 && e.durationMs >= 0));
  assert.equal((await request(app(spyLogger(), { nodeEnv: 'production' })).get('/api/logger-test')).status, 404);
  assert.equal((await request(app(spyLogger(), { loggerTestEnabled: false })).get('/api/logger-test')).status, 404);
  const valid = { PORT: '3000', MONGODB_URI: 'mongodb://localhost/test', NODE_ENV: 'production', LOGGER_TEST_ENABLED: 'true' };
  assert.equal(validateEnv(valid).loggerTestEnabled, false);
  assert.throws(() => validateEnv({ ...valid, LOGGER_TEST_ENABLED: 'yes' }), /LOGGER_TEST_ENABLED/);
});

test('Middleware distingue warning de error/fatal y mantiene el contrato público', async () => {
  const log = spyLogger(), http = request(app(log));
  await http.get('/no-existe?token=never-log-this').expect(404);
  assert.ok(log.entries.some(e => e.level === 'warning' && e.code === 'ROUTE_NOT_FOUND'));
  await http.get('/api/mocks/users?qty=-1').expect(400);
  assert.ok(log.entries.some(e => e.level === 'warning' && e.code === 'INVALID_MOCK_QUANTITY'));
  assert.ok(!JSON.stringify(log.entries).includes('never-log-this'));
  const failure = new Error('internal-only');
  const response = await request(app(log, { userService: { list: async () => { throw failure; } } })).get('/api/users');
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(response.body).includes('internal-only'));
  assert.ok(log.entries.some(e => e.level === 'error' && e.error === failure && e.requestId));
});

test('Conexión inicial registra éxito y falla fatal sin cambiar el error original', async () => {
  const log = spyLogger(), connection = { models: {}, connect: async () => {} };
  await connectDatabase('mongodb://test', { connection, log });
  assert.ok(log.entries.some(e => e.level === 'info' && /establecida/.test(e.message)));
  const failure = new Error('unavailable');
  connection.connect = async () => { throw failure; };
  await assert.rejects(connectDatabase('mongodb://test', { connection, log }), e => e === failure);
  assert.ok(log.entries.some(e => e.level === 'fatal' && e.error === failure));
});

test('Mocks y creación de entidades registran eventos sin guardar cuerpos con datos personales', async () => {
  const log = spyLogger();
  const mock = createMockService({ insertDataset: async () => ({ mode: 'transaction' }) },
    { log, nodeEnv: 'test', seedEnabled: true });
  mock.orders({ qty: '2' });
  await mock.seed({ qty: '2', resource: 'all' });
  assert.ok(log.entries.some(e => e.level === 'debug' && e.qty === 2));
  assert.ok(log.entries.some(e => e.level === 'info' && e.count === 2 && /Pedidos/.test(e.message)));
  await createUserService({ create: async () => ({ _id: 'id1' }) }, { log })
    .create({ name: 'Private Name', email: 'private@example.test' });
  assert.ok(log.entries.some(e => e.level === 'info' && e.id === 'id1'));
  assert.ok(!JSON.stringify(log.entries).includes('private@example.test'));
});
