import { InvalidIdError, ValidationError } from '../errors/domain-errors.js';
export function assertId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new InvalidIdError();
}
export function bodyFields(body, allowed, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Se requiere un objeto JSON.');
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ValidationError('Hay campos no permitidos.');
  if (partial && !Object.keys(body).length) throw new ValidationError('La actualización está vacía.');
}
export function text(value, field, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new ValidationError(field + ' debe ser un texto no vacío de hasta ' + max + ' caracteres.');
  return value.trim();
}
export function pagination(query = {}) {
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max)
      throw new ValidationError('Paginación inválida.');
    return Number(value);
  };
  return { page: parse(query.page, 1, 100000), limit: parse(query.limit, 20, 100) };
}
