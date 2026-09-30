import { USER_ROLES } from '../constants/index.js';
import { AppError } from '../utils/app-error.js';
import { assertId, bodyFields, text, pagination } from '../utils/validation.js';

export function createUserService(repository) {
  function prepare(body, partial = false) {
    bodyFields(body, ['name', 'email', 'role'], partial);
    const data = {};
    if (!partial || 'name' in body) data.name = text(body.name, 'name');
    if (!partial || 'email' in body) {
      data.email = text(body.email, 'email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new AppError(400, 'Email inválido.');
    }
    if (!partial || 'role' in body) {
      data.role = body.role === undefined ? USER_ROLES.USER : body.role;
      if (!Object.values(USER_ROLES).includes(data.role)) throw new AppError(400, 'Rol inválido.');
    }
    return data;
  }
  async function requireResult(promise) {
    const result = await promise;
    if (!result) throw new AppError(404, 'Usuario no encontrado.');
    return result;
  }
  return {
    list: query => repository.list(pagination(query)),
    get(id) { assertId(id); return requireResult(repository.findById(id)); },
    create(body) { return repository.create(prepare(body)); },
    update(id, body) { assertId(id); return requireResult(repository.update(id, prepare(body, true))); },
    remove(id) { assertId(id); return requireResult(repository.remove(id)); }
  };
}
