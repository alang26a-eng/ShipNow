import { ERROR_DICTIONARY } from '../errors/error-dictionary.js';

export class AppError extends Error {
  constructor(code, { message, details = null, cause } = {}) {
    const definition = ERROR_DICTIONARY[code];
    if (!definition) throw new TypeError('Código de error no definido en el diccionario.');
    super(message ?? definition.message, { cause });
    this.name = new.target.name;
    this.code = code;
    this.status = definition.status;
    this.details = details;
  }
}
