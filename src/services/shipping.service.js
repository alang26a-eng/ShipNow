import { assertId, bodyFields, text, pagination } from '../utils/validation.js';
import { AppError } from '../utils/app-error.js';
import { ValidationError, InvalidStatusError } from '../errors/domain-errors.js';
import { ORDER_STATUSES, ORDER_PRIORITIES, DELIVERY_STATUSES, DRIVER_REQUIRED_STATUSES } from '../constants/index.js';

export function createShippingService(kind, repository, { users, orders } = {}) {
  const isOrder = kind === 'order';
  const statuses = Object.values(isOrder ? ORDER_STATUSES : DELIVERY_STATUSES);
  const allowed = isOrder ? ['user','description','pickupAddress','deliveryAddress','weightKg','items','status','priority'] : ['order','driver','status','deliveredAt'];
  const notFound = () => new AppError(isOrder ? 'ORDER_NOT_FOUND' : 'DELIVERY_NOT_FOUND');
  async function requireRow(id) { assertId(id); const row = await repository.findById(id); if (!row) throw notFound(); return row; }
  async function prepare(body, current) {
    bodyFields(body, allowed, Boolean(current));
    const existing = { ...(current ?? {}) };
    for (const field of ['user','order','driver']) {
      if (existing[field] != null) existing[field] = String(existing[field]);
    }
    const data = { ...existing, ...body };
    data.status ??= 'PENDING';
    if (!statuses.includes(data.status)) throw new InvalidStatusError(statuses);
    if (isOrder) {
      assertId(data.user);
      if (!await users.findById(data.user)) throw new AppError('USER_NOT_FOUND');
      for (const field of ['description','pickupAddress','deliveryAddress']) data[field] = text(data[field], field, field === 'description' ? 300 : 120);
      if (typeof data.weightKg !== 'number' || !Number.isFinite(data.weightKg) || data.weightKg < 0.01) throw new ValidationError('weightKg debe ser mayor o igual a 0.01.');
      data.priority ??= 'NORMAL';
      if (!Object.values(ORDER_PRIORITIES).includes(data.priority)) throw new ValidationError('Prioridad inválida.');
      data.items ??= [];
      if (!Array.isArray(data.items)) throw new ValidationError('items debe ser un array.');
      data.items = data.items.map(item => {
        bodyFields(item, ['description','quantity']);
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new ValidationError('quantity debe ser un entero positivo.');
        return { description: text(item.description, 'description'), quantity: item.quantity };
      });
    } else {
      assertId(data.order);
      if (!await orders.findById(data.order)) throw new AppError('ORDER_NOT_FOUND');
      data.driver ??= null;
      if (data.driver !== null) {
        assertId(data.driver); const driver = await users.findById(data.driver);
        if (!driver) throw new AppError('USER_NOT_FOUND');
        if (driver.role !== 'DRIVER') throw new ValidationError('driver debe tener rol DRIVER.');
      }
      if (DRIVER_REQUIRED_STATUSES.includes(data.status) && !data.driver) throw new ValidationError('El estado requiere driver.');
      data.deliveredAt ??= null;
      if (data.deliveredAt instanceof Date) data.deliveredAt = data.deliveredAt.toISOString();
      if (data.deliveredAt !== null && (typeof data.deliveredAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(data.deliveredAt) || !Number.isFinite(Date.parse(data.deliveredAt)))) throw new ValidationError('deliveredAt debe ser una fecha ISO válida.');
      if (data.status === 'DELIVERED' && !data.deliveredAt) throw new ValidationError('DELIVERED requiere deliveredAt.');
    }
    return Object.fromEntries(allowed.map(key => [key, data[key]]));
  }
  return {
    list(query = {}) {
      const filters = {};
      if (query.status !== undefined) { if (!statuses.includes(query.status)) throw new InvalidStatusError(statuses); filters.status = query.status; }
      return repository.list(pagination(query), filters);
    },
    get: requireRow,
    async create(body) { return repository.create(await prepare(body)); },
    async update(id, body) { const row = await requireRow(id); const result = await repository.update(id, await prepare(body, row)); if (!result) throw notFound(); return result; }
  };
}
