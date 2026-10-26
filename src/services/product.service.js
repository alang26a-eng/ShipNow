import { PRODUCT_STATUSES } from '../constants/index.js';
import { ValidationError, InvalidStatusError, ProductNotFoundError } from '../errors/domain-errors.js';
import { assertId, bodyFields, text, pagination } from '../utils/validation.js';
import logger from '../config/logger.js';

export function createProductService(repository, { log = logger } = {}) {
  function prepare(body, partial = false) {
    bodyFields(body, ['name', 'price', 'stock'], partial);
    const data = {};
    if (!partial || 'name' in body) data.name = text(body.name, 'name');
    if (!partial || 'price' in body) {
      if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)
        throw new ValidationError('price debe ser un número no negativo.');
      data.price = body.price;
    }
    if (!partial || 'stock' in body) {
      if (!Number.isSafeInteger(body.stock) || body.stock < 0) throw new ValidationError('stock debe ser un entero no negativo.');
      data.stock = body.stock;
      data.status = body.stock > 0 ? PRODUCT_STATUSES.AVAILABLE : PRODUCT_STATUSES.OUT_OF_STOCK;
    }
    return data;
  }
  async function requireResult(promise) {
    const result = await promise;
    if (!result) throw new ProductNotFoundError();
    return result;
  }
  return {
    list(query = {}) {
      const filters = {};
      if (query.status !== undefined) {
        if (!Object.values(PRODUCT_STATUSES).includes(query.status)) throw new InvalidStatusError(Object.values(PRODUCT_STATUSES));
        filters.status = query.status;
      }
      return repository.list(pagination(query), filters);
    },
    get(id) { assertId(id); return requireResult(repository.findById(id)); },
    async create(body) {
      const product = await repository.create(prepare(body));
      log.info('Producto creado correctamente', { id: String(product._id) }); return product;
    },
    async update(id, body) {
      assertId(id); const product = await requireResult(repository.update(id, prepare(body, true)));
      log.info('Producto actualizado correctamente', { id }); return product;
    },
    remove(id) { assertId(id); return requireResult(repository.remove(id)); }
  };
}
