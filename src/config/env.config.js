import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export function validateEnv(source) {
  const required = ['PORT', 'MONGODB_URI', 'NODE_ENV'];
  const missing = required.filter(key => typeof source[key] !== 'string' || !source[key].trim());
  if (missing.length) throw new Error('Configuración inválida: faltan variables obligatorias: ' + missing.join(', '));
  if (!/^\d+$/.test(source.PORT) || Number(source.PORT) < 1 || Number(source.PORT) > 65535)
    throw new Error('Configuración inválida: PORT debe ser un entero entre 1 y 65535.');
  if (!/^mongodb(?:\+srv)?:\/\/\S+$/.test(source.MONGODB_URI))
    throw new Error('Configuración inválida: MONGODB_URI debe ser una URI MongoDB válida.');
  if (!['development', 'test', 'production'].includes(source.NODE_ENV))
    throw new Error('Configuración inválida: NODE_ENV debe ser development, test o production.');
  for (const key of ['MOCKS_ENABLED', 'MOCK_SEED_ENABLED']) {
    if (source[key] !== undefined && !['true', 'false'].includes(source[key]))
      throw new Error(`Configuración inválida: ${key} debe ser true o false.`);
  }
  return Object.freeze({
    port: Number(source.PORT), mongodbUri: source.MONGODB_URI, nodeEnv: source.NODE_ENV,
    mocksEnabled: source.NODE_ENV !== 'production' && source.MOCKS_ENABLED !== 'false',
    mockSeedEnabled: source.NODE_ENV !== 'production' && source.MOCK_SEED_ENABLED === 'true'
  });
}

// Se ejecuta antes de abrir cualquier conexión o puerto.
export function loadConfig() {
  dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
  return validateEnv(process.env);
}
export default loadConfig;
