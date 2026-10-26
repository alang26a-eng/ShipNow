import { Router } from 'express';
import { LOG_LEVELS } from '../config/logger.js';

export function createLoggerRoutes(log) {
  const router = Router();
  router.get('/', (req, res) => {
    const levels = ['debug', 'http', 'info', 'warning', 'error', 'fatal'];
    for (const level of levels) log.log(level, `Prueba de logger: ${level}`, {
      event: 'logger_test', requestId: req.requestId, simulated: true
    });
    res.json({ status: 'ok', message: 'Prueba de logging ejecutada. fatal es simulado; no detiene el servidor.',
      levels: levels.filter(level => Object.hasOwn(LOG_LEVELS, level)), requestId: req.requestId });
  });
  return router;
}
