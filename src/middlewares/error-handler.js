import { AppError } from '../utils/app-error.js';
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Cuerpo de solicitud demasiado grande.' });
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : error.message });
}
