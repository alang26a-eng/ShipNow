import { randomUUID } from 'node:crypto';
import logger from '../config/logger.js';

export function requestLogger(log = logger) {
  return (req, res, next) => {
    const start = performance.now();
    req.requestId = randomUUID();
    req.log = log;
    res.setHeader('X-Request-Id', req.requestId);
    res.once('finish', () => log.http('Solicitud HTTP completada', {
      requestId: req.requestId, method: req.method, path: req.path,
      status: res.statusCode, durationMs: Number((performance.now() - start).toFixed(2))
    }));
    next();
  };
}
