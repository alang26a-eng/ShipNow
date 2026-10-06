import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateEnv } from '../src/config/env.config.js';
const valid = { PORT: '3000', MONGODB_URI: 'mongodb://127.0.0.1:27017/shipnow', NODE_ENV: 'test' };
test('Configuración: variables obligatorias, formato y objeto inmutable', () => {
  assert.equal(validateEnv(valid).port, 3000);
  assert.ok(Object.isFrozen(validateEnv(valid)));
  for (const key of Object.keys(valid)) {
    const source = { ...valid }; delete source[key];
    assert.throws(() => validateEnv(source), new RegExp(key));
  }
  for (const PORT of ['0', '65536', '3.14', 'abc']) assert.throws(() => validateEnv({ ...valid, PORT }), /PORT/);
  assert.throws(() => validateEnv({ ...valid, NODE_ENV: 'invalid' }), /NODE_ENV/);
  assert.throws(() => validateEnv({ ...valid, MONGODB_URI: 'https://example.com' }), /MONGODB_URI/);
});
test('El proceso real termina antes de conectar si falta una variable', () => {
  for (const key of Object.keys(valid)) {
    const env = { ...valid, [key]: '' };
    const result = spawnSync(process.execPath, ['src/server.js'], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp('Configuración inválida:.*' + key));
    assert.ok(!result.stdout.includes('disponible'));
  }
});
test('Flags de mocks: defaults conservadores, booleanos válidos y producción bloqueada', () => {
  assert.equal(validateEnv(valid).mocksEnabled, true);
  assert.equal(validateEnv(valid).mockSeedEnabled, false);
  assert.equal(validateEnv({ ...valid, MOCK_SEED_ENABLED: 'true' }).mockSeedEnabled, true);
  assert.equal(validateEnv({ ...valid, MOCKS_ENABLED: 'false' }).mocksEnabled, false);
  for (const key of ['MOCKS_ENABLED', 'MOCK_SEED_ENABLED'])
    assert.throws(() => validateEnv({ ...valid, [key]: 'yes' }), new RegExp(key));
  const production = validateEnv({ ...valid, NODE_ENV: 'production', MOCKS_ENABLED: 'true', MOCK_SEED_ENABLED: 'true' });
  assert.equal(production.mocksEnabled, false);
  assert.equal(production.mockSeedEnabled, false);
});
