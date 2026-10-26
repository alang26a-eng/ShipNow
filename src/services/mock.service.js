import { randomUUID } from 'node:crypto';
import { MOCK_RESOURCES, MOCK_LIMITS, USER_ROLES } from '../constants/index.js';
import {
  InvalidMockQuantityError, InvalidMockResourceError, MockSeedDisabledError,
  MockGenerationError, ValidationError
} from '../errors/domain-errors.js';
import { generateDataset } from './mock-generator.js';
import logger from '../config/logger.js';

function quantity(query, maximum) {
  const raw = query.qty ?? String(MOCK_LIMITS.DEFAULT_QTY);
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))
      || Number(raw) < 1 || Number(raw) > maximum)
    throw new InvalidMockQuantityError(maximum);
  return Number(raw);
}
function checkQuery(query, allowed) {
  if (Object.keys(query).some(key => !allowed.includes(key)))
    throw new ValidationError('Parámetro de consulta desconocido.');
}

export function createMockService(repository, {
  seedEnabled = false, nodeEnv = 'production', generate = generateDataset, log = logger
} = {}) {
  function generateSafely(resource, qty) {
    try {
      const dataset = generate(resource, qty);
      log.debug('Datos mock generados en memoria', { resource, qty });
      return dataset;
    }
    catch (error) { throw new MockGenerationError(error); }
  }
  function preview(resource, query) {
    checkQuery(query, ['qty']);
    const dataset = generateSafely(resource, quantity(query, MOCK_LIMITS.MAX_PREVIEW_QTY));
    if (resource === MOCK_RESOURCES.USERS) return dataset.users;
    if (resource === MOCK_RESOURCES.DRIVERS) return dataset.drivers;
    return dataset; // Incluye las entidades referenciadas: ningún ID huérfano.
  }
  return {
    users: query => preview(MOCK_RESOURCES.USERS, query),
    drivers: query => preview(MOCK_RESOURCES.DRIVERS, query),
    orders: query => preview(MOCK_RESOURCES.ORDERS, query),
    deliveries: query => preview(MOCK_RESOURCES.DELIVERIES, query),
    scenario: query => preview(MOCK_RESOURCES.ALL, query),
    async seed(query, body) {
      if (!seedEnabled || nodeEnv === 'production')
        throw new MockSeedDisabledError();
      checkQuery(query, ['qty', 'resource']);
      if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length))
        throw new ValidationError('seed recibe qty y resource por query; no admite datos en el body.');
      const resource = query.resource ?? MOCK_RESOURCES.USERS;
      if (!Object.values(MOCK_RESOURCES).includes(resource))
        throw new InvalidMockResourceError(Object.values(MOCK_RESOURCES));
      const qty = quantity(query, MOCK_LIMITS.MAX_SEED_QTY);
      const dataset = generateSafely(resource, qty);
      const batchId = randomUUID();
      const result = await repository.insertDataset(dataset, batchId);
      const colecciones = {
        usuarios: dataset.users.length + dataset.drivers.length,
        pedidos: dataset.orders.length, entregas: dataset.deliveries.length
      };
      log.info('Lote de datos mock guardado en MongoDB', { batchId, resource, qty, colecciones, mode: result.mode });
      if (dataset.orders.length) log.info('Pedidos mock creados correctamente', { batchId, count: dataset.orders.length });
      return {
        insertados: Object.values(colecciones).reduce((total, count) => total + count, 0),
        ...(dataset.orders.length === 0 ? { coleccion: 'usuarios' } : {}),
        colecciones, repartidores: dataset.drivers.length || dataset.users.filter(user => user.role === USER_ROLES.DRIVER).length,
        batchId, persistencia: result.mode
      };
    }
  };
}
