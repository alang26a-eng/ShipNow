import { USER_ROLES } from '../constants/index.js';
import { ValidationError, InvalidRoleError, UserNotFoundError } from '../errors/domain-errors.js';
import { assertId, bodyFields, text, pagination } from '../utils/validation.js';
import logger from '../config/logger.js';

export function createUserService(repository, { log = logger } = {}) {
  function prepare(body, partial = false) {
    bodyFields(body, ['name', 'email', 'role'], partial);
    const data = {};
    if (!partial || 'name' in body) data.name = text(body.name, 'name');
    if (!partial || 'email' in body) {
      data.email = text(body.email, 'email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new ValidationError('Email inválido.', { field: 'email' });
    }
    if (!partial || 'role' in body) {
      data.role = body.role === undefined ? USER_ROLES.USER : body.role;
      if (!Object.values(USER_ROLES).includes(data.role)) throw new InvalidRoleError(Object.values(USER_ROLES));
    }
    return data;
  }
  async function requireResult(promise) {
    const result = await promise;
    if (!result) throw new UserNotFoundError();
    return result;
  }
  return {
    list: query => repository.list(pagination(query)),
    get(id) { assertId(id); return requireResult(repository.findById(id)); },
    async create(body) {
      const user = await repository.create(prepare(body));
      log.info('Usuario creado correctamente', { id: String(user._id) });
      return user;
    },
    async update(id, body) {
      assertId(id); const user = await requireResult(repository.update(id, prepare(body, true)));
      log.info('Usuario actualizado correctamente', { id }); return user;
    },
    remove(id) { assertId(id); return requireResult(repository.remove(id)); }
  };
}
