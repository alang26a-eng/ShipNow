import { AppError } from '../utils/app-error.js';

export class ValidationError extends AppError {
  constructor(message, details = null, cause) {
    super('VALIDATION_ERROR', { message, details, cause });
  }
}
export class InvalidIdError extends AppError {
  constructor() { super('INVALID_ID', { details: { field: 'id' } }); }
}
export class UserNotFoundError extends AppError {
  constructor() { super('USER_NOT_FOUND'); }
}
export class ProductNotFoundError extends AppError {
  constructor() { super('PRODUCT_NOT_FOUND'); }
}
export class InvalidStatusError extends AppError {
  constructor(allowed) { super('INVALID_STATUS', { details: { field: 'status', allowed } }); }
}
export class InvalidRoleError extends AppError {
  constructor(allowed) { super('INVALID_ROLE', { details: { field: 'role', allowed } }); }
}
export class InvalidMockQuantityError extends AppError {
  constructor(maximum) {
    super('INVALID_MOCK_QUANTITY', { details: { field: 'qty', min: 1, max: maximum } });
  }
}
export class InvalidMockResourceError extends AppError {
  constructor(allowed) { super('INVALID_MOCK_RESOURCE', { details: { field: 'resource', allowed } }); }
}
export class MockSeedDisabledError extends AppError {
  constructor() { super('MOCK_SEED_DISABLED'); }
}
export class MockGenerationError extends AppError {
  constructor(cause) { super('MOCK_GENERATION_FAILED', { cause }); }
}
export class MockPersistenceError extends AppError {
  constructor(cause) { super('MOCK_PERSISTENCE_FAILED', { cause }); }
}
export class MockCleanupError extends AppError {
  constructor(batchId, cause) { super('MOCK_CLEANUP_FAILED', { details: { batchId }, cause }); }
}
export class RouteNotFoundError extends AppError {
  constructor() { super('ROUTE_NOT_FOUND'); }
}
