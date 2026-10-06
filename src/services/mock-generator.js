import { randomBytes, randomInt } from 'node:crypto';
import {
  USER_ROLES, ORDER_STATUSES, ORDER_PRIORITIES, DELIVERY_STATUSES,
  DELIVERY_STATUS_BY_ORDER, DRIVER_REQUIRED_STATUSES, MOCK_RESOURCES
} from '../constants/index.js';

const names = ['Ana', 'Luis', 'Lucía', 'Mateo', 'Sofía', 'Tomás', 'Valentina', 'Julián'];
const surnames = ['Pérez', 'Gómez', 'López', 'Fernández', 'Díaz', 'Romero', 'Torres', 'Ruiz'];
const streets = ['Av. Rivadavia', 'Av. Corrientes', 'Av. Cabildo', 'Av. Santa Fe', 'Av. San Martín'];
const packages = ['Caja de libros', 'Paquete de ropa', 'Accesorios de computación', 'Documentación'];
const pick = values => values[randomInt(values.length)];
const id = () => randomBytes(12).toString('hex'); // Compatible con ObjectId, sin importar Mongoose.
const address = () => `${pick(streets)} ${randomInt(100, 8000)}, CABA`;

export function generateUsers(qty, role) {
  const roles = [USER_ROLES.USER, USER_ROLES.DRIVER, USER_ROLES.ADMIN];
  return Array.from({ length: qty }, (_, index) => {
    const _id = id();
    return {
      _id, name: `${pick(names)} ${pick(surnames)}`,
      email: `mock.${_id}@test.com`, role: role ?? roles[index % roles.length]
    };
  });
}

export function generateDataset(resource, qty) {
  if (resource === MOCK_RESOURCES.USERS) return { users: generateUsers(qty), drivers: [], orders: [], deliveries: [] };
  if (resource === MOCK_RESOURCES.DRIVERS) return { users: [], drivers: generateUsers(qty, USER_ROLES.DRIVER), orders: [], deliveries: [] };

  const users = generateUsers(qty, USER_ROLES.USER);
  const withDeliveries = resource !== MOCK_RESOURCES.ORDERS;
  const drivers = withDeliveries ? generateUsers(qty, USER_ROLES.DRIVER) : [];
  const statuses = Object.values(ORDER_STATUSES);
  const orders = users.map((user, index) => ({
    _id: id(), user: user._id, description: pick(packages),
    pickupAddress: address(), deliveryAddress: address(), weightKg: randomInt(1, 200) / 10,
    // Ciclar estados garantiza variedad también en lotes pequeños.
    status: statuses[index % statuses.length], priority: pick(Object.values(ORDER_PRIORITIES))
  }));
  const deliveries = withDeliveries ? orders.map((order, index) => {
    const status = DELIVERY_STATUS_BY_ORDER[order.status];
    return {
      _id: id(), order: order._id, status,
      driver: DRIVER_REQUIRED_STATUSES.includes(status) ? drivers[index % drivers.length]._id : null,
      deliveredAt: status === DELIVERY_STATUSES.DELIVERED ? new Date() : null
    };
  }) : [];
  return { users, drivers, orders, deliveries };
}
