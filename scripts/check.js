import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(dir + '/' + entry.name) : [dir + '/' + entry.name]);
}
for (const file of [...walk('src'), ...walk('test'), ...walk('integration'), ...walk('scripts')].filter(file => file.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const source = readFileSync(file, 'utf8');
  if (file.startsWith('src/') && file !== 'src/config/env.config.js') assert.ok(!source.includes('process.env'), file);
  if (/src\/(controllers|services|routes)\//.test(file))
    assert.ok(!/from ['"][^'"]*(mongoose|models\/)/.test(source), file);
}
console.log('Sintaxis y límites de capas verificados.');
