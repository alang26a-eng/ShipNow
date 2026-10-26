import { AppError } from '../utils/app-error.js';
import { normalizePersistenceError } from '../errors/persistence-error.js';
import logger from '../config/logger.js';

function normalize(error) {
  const parserCodes = {
    'entity.parse.failed': 'INVALID_JSON',
    'entity.too.large': 'PAYLOAD_TOO_LARGE',
    'encoding.unsupported': 'UNSUPPORTED_ENCODING',
    'charset.unsupported': 'UNSUPPORTED_ENCODING',
    'request.aborted': 'INVALID_REQUEST',
    'request.size.invalid': 'INVALID_REQUEST'
  };
  if (Object.hasOwn(parserCodes, error?.type ?? '')) return new AppError(parserCodes[error.type]);
  if (error instanceof URIError) return new AppError('INVALID_REQUEST');
  const translated = normalizePersistenceError(error);
  return translated instanceof AppError ? translated : new AppError('INTERNAL_ERROR', { cause: error });
}

// Único lugar que construye y envía respuestas HTTP de error.
export function createErrorHandler(log = logger) {
 return function errorHandler(error, req, res, next) {
  const normalized = normalize(error);
  const level = normalized.code === 'MOCK_CLEANUP_FAILED' ? 'fatal' : normalized.status >= 500 ? 'error' : 'warning';
  (req.log ?? log).log(level, normalized.message, {
    code: normalized.code, status: normalized.status, requestId: req.requestId,
    method: req.method, path: req.path,
    ...(normalized.status >= 500 ? { error: normalized.cause ?? error } : {})
  });
  if (res.headersSent) return next(error);
  res.status(normalized.status).json({
    status: 'error',
    error: { code: normalized.code, message: normalized.message, details: normalized.details }
  });
 };
}
export const errorHandler = createErrorHandler();
