import { AppError } from './app-error.js';
export function assertId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new AppError(400, 'ID inválido.');
}
export function bodyFields(body, allowed, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'Se requiere un objeto JSON.');
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new AppError(400, 'Hay campos no permitidos.');
  if (partial && !Object.keys(body).length) throw new AppError(400, 'La actualización está vacía.');
}
export function text(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(400, field + ' debe ser un texto no vacío de hasta ' + max + ' caracteres.');
  return value.trim();
}
export function pagination(query = {}) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max)
      throw new AppError(400, 'Paginación inválida.');
    return Number(value);
  };
  return { page: parse(query.page, 1, 100000), limit: parse(query.limit, 20, 100) };
}
