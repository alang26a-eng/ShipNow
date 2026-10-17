import { AppError } from '../utils/app-error.js';
import { ValidationError } from './domain-errors.js';

const unavailableNames = new Set([
  'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
  'MongooseServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError',
  'MongoOperationTimeoutError', 'MongoPoolClearedError', 'MongoServerClosedError'
]);

// Traduce detalles técnicos en errores públicos; conserva la causa solo dentro del proceso.
export function normalizePersistenceError(error) {
  if (error instanceof AppError) return error;
  if (error?.code === 11000) return new AppError('DUPLICATE_RESOURCE', { cause: error });
  if (error?.name === 'ValidationError')
    return new ValidationError('Los datos no cumplen el esquema de persistencia.',
      { fields: Object.keys(error.errors ?? {}) }, error);
  if (error?.name === 'CastError') return new AppError('INVALID_ID', { cause: error });
  if (unavailableNames.has(error?.name) || [50, 89, 91, 11600, 11602].includes(error?.code))
    return new AppError('DATABASE_UNAVAILABLE', { cause: error });
  return error;
}
