import { PRODUCT_STATUSES } from '../constants/index.js';
import { AppError } from '../utils/app-error.js';
import { assertId, bodyFields, text, pagination } from '../utils/validation.js';

export function createProductService(repository) {
  function prepare(body, partial = false) {
    bodyFields(body, ['name', 'price', 'stock'], partial);
    const data = {};
    if (!partial || 'name' in body) data.name = text(body.name, 'name');
    if (!partial || 'price' in body) {
      if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)
        throw new AppError(400, 'price debe ser un número no negativo.');
      data.price = body.price;
    }
    if (!partial || 'stock' in body) {
      if (!Number.isSafeInteger(body.stock) || body.stock < 0) throw new AppError(400, 'stock debe ser un entero no negativo.');
      data.stock = body.stock;
      data.status = body.stock > 0 ? PRODUCT_STATUSES.AVAILABLE : PRODUCT_STATUSES.OUT_OF_STOCK;
    }
    return data;
  }
  async function requireResult(promise) {
    const result = await promise;
    if (!result) throw new AppError(404, 'Producto no encontrado.');
    return result;
  }
  return {
    list(query = {}) {
      const filters = {};
      if (query.status !== undefined) {
        if (!Object.values(PRODUCT_STATUSES).includes(query.status)) throw new AppError(400, 'Estado inválido.');
        filters.status = query.status;
      }
      return repository.list(pagination(query), filters);
    },
    get(id) { assertId(id); return requireResult(repository.findById(id)); },
    create(body) { return repository.create(prepare(body)); },
    update(id, body) { assertId(id); return requireResult(repository.update(id, prepare(body, true))); },
    remove(id) { assertId(id); return requireResult(repository.remove(id)); }
  };
}
