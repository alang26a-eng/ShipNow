import { USER_ROLES, PRODUCT_STATUSES, ORDER_STATUSES, ORDER_PRIORITIES, DELIVERY_STATUSES, MOCK_LIMITS, MOCK_RESOURCES } from '../constants/index.js';
import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE, PROOF_TYPE, USER_DOCUMENT_TYPES } from '../config/uploads.js';
import { ERROR_DICTIONARY } from '../errors/error-dictionary.js';
export const ref = name => ({ $ref: '#/components/schemas/' + name });
const str = (extra = {}) => ({ type: 'string', ...extra });
const enumeration = values => str({ enum: Object.values(values) });
const obj = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const array = items => ({ type: 'array', items });
const id = str({ pattern: '^[a-fA-F0-9]{24}$', example: '507f1f77bcf86cd799439011' });
const name = str({ minLength: 1, maxLength: 120 });
const date = str({ format: 'date-time' });
const nullableDate = { ...date, nullable: true };
const userInput = obj({ name, email: str({ format: 'email', maxLength: 254 }), role: { ...enumeration(USER_ROLES), default: 'USER' } }, ['name','email']);
const productInput = obj({ name, price: { type: 'number', minimum: 0 }, stock: { type: 'integer', minimum: 0 } }, ['name','price','stock']);
const orderInput = obj({ user: id, description: str({ minLength: 1, maxLength: 300 }), pickupAddress: name, deliveryAddress: name, weightKg: { type: 'number', minimum: 0.01 }, items: array(ref('OrderItem')), status: { ...enumeration(ORDER_STATUSES), default: 'PENDING' }, priority: { ...enumeration(ORDER_PRIORITIES), default: 'NORMAL' } }, ['user','description','pickupAddress','deliveryAddress','weightKg']);
const deliveryInput = obj({ order: id, driver: { ...id, nullable: true }, status: { ...enumeration(DELIVERY_STATUSES), default: 'PENDING' }, deliveredAt: nullableDate }, ['order']);
export const schemas = {
  OrderItem: { ...obj({ description: name, quantity: { type: 'integer', minimum: 1 } }, ['description','quantity']), additionalProperties: false },
  ErrorResponse: obj({ status: str({ enum: ['error'] }), error: obj({ code: str({ enum: Object.keys(ERROR_DICTIONARY) }), message: str(), details: { nullable: true, description: 'Detalle contextual o null.' } }, ['code','message','details']) }, ['status','error']),
  SuccessResponse: obj({ data: { description: 'Entidad o lista según operación.' } }, ['data']),
  Dataset: obj({ users: array(ref('User')), drivers: array(ref('User')), orders: array(ref('Order')), deliveries: array(ref('Delivery')) }, ['users','drivers','orders','deliveries']),
  SeedResult: obj({ insertados: { type: 'integer' }, coleccion: str({ enum: ['usuarios'] }), colecciones: obj({ usuarios: { type: 'integer' }, pedidos: { type: 'integer' }, entregas: { type: 'integer' } }, ['usuarios','pedidos','entregas']), repartidores: { type: 'integer' }, batchId: str({ format: 'uuid' }), persistencia: str({ enum: ['transaction','compensated'] }) }, ['insertados','colecciones','repartidores','batchId','persistencia']),
  LoggerResult: obj({ status: str({ enum: ['ok'] }), message: str(), levels: array(str({ enum: ['debug','http','info','warning','error','fatal'] })), requestId: str() }, ['status','message','levels','requestId'])
};
for (const [entity, input] of Object.entries({ User: userInput, Product: productInput, Order: orderInput, Delivery: deliveryInput })) {
  schemas[entity + 'Input'] = { ...input, additionalProperties: false };
  schemas[entity + 'Update'] = { ...input, minProperties: 1, additionalProperties: false };
  delete schemas[entity + 'Update'].required;
  schemas[entity] = obj({ _id: id, ...input.properties, createdAt: date, updatedAt: date }, ['_id', ...input.required]);
}
const metadataProperties = {
  originalName: str(), filename: str(), path: str(), mimeType: enumeration(ACCEPTED_MIME_TYPES),
  size: { type: 'integer', minimum: 1, maximum: MAX_FILE_SIZE },
  documentType: enumeration([...USER_DOCUMENT_TYPES, PROOF_TYPE]), uploadedAt: date
};
schemas.UploadMetadata = obj(metadataProperties, Object.keys(metadataProperties));
schemas.User.properties.documents = array(ref('UploadMetadata'));
schemas.Delivery.properties.proofs = array(ref('UploadMetadata'));

const json = schema => ({ 'application/json': { schema } });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
function errors(codes) {
  const byStatus = {};
  for (const code of [...new Set(codes)]) {
    const definition = ERROR_DICTIONARY[code];
    (byStatus[definition.status] ??= []).push([code, definition]);
  }
  return Object.fromEntries(Object.entries(byStatus).map(([status, entries]) => [status, {
    description: entries.map(([code, def]) => code + ': ' + def.message).join(' '),
    content: { 'application/json': { schema: ref('ErrorResponse'), examples: Object.fromEntries(entries.map(([code, def]) => [code, { value: { status: 'error', error: { code, message: def.message, details: null } } }])) } }
  }]));
}
const param = (name, schema, description, where = 'query') => ({ name, in: where, required: where === 'path', description, schema });
const pagination = [param('page', { type: 'integer', minimum: 1, maximum: 100000, default: 1 }, 'Página.'), param('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 'Tamaño de página.')];
const parserErrors = ['INVALID_JSON','PAYLOAD_TOO_LARGE','UNSUPPORTED_ENCODING','INVALID_REQUEST'];
const baseErrors = ['INTERNAL_ERROR','DATABASE_UNAVAILABLE'];
const body = schema => ({ required: true, content: json(schema) });
const envelope = schema => ({ allOf: [ref('SuccessResponse'), obj({ data: schema }, ['data'])] });
const success = (schema, code = 200) => ({ [code]: response('Operación exitosa.', envelope(schema)) });
export function buildOpenApi({ mocksEnabled = true, loggerEnabled = true, ordersEnabled = true, deliveriesEnabled = true, uploadsEnabled = true } = {}) {
  const paths = {};
  const tags = ['Users','Orders','Deliveries','Mocks','Logger','Products','Health'].map(name => ({ name, description: name === 'Logger' ? 'Herramienta técnica de validación de logging; no es una funcionalidad de negocio.' : 'Módulo ' + name }));
  for (const [plural, entity, tag, statuses, enabled] of [
    ['users','User','Users',null,true], ['products','Product','Products',PRODUCT_STATUSES,true],
    ['orders','Order','Orders',ORDER_STATUSES,ordersEnabled], ['deliveries','Delivery','Deliveries',DELIVERY_STATUSES,deliveriesEnabled]
  ]) {
    if (!enabled) continue;
    const root = '/api/' + plural;
    const extra = entity === 'User' ? ['INVALID_ROLE'] : entity === 'Order' || entity === 'Delivery' ? ['INVALID_STATUS'] : [];
    const writeErrors = [...baseErrors,...parserErrors,'VALIDATION_ERROR',...extra, ...(entity === 'User' || entity === 'Delivery' ? ['DUPLICATE_RESOURCE'] : []), ...(entity === 'Order' || entity === 'Delivery' ? ['INVALID_ID','USER_NOT_FOUND', ...(entity === 'Delivery' ? ['ORDER_NOT_FOUND'] : [])] : [])];
    const detail = entity === 'Order' ? 'El usuario debe existir. items es opcional (default []). Estados enumerados; no se impone un flujo de transiciones.' : entity === 'Delivery' ? 'El pedido debe existir y tener una sola entrega. driver debe existir y tener rol DRIVER; es obligatorio para ASSIGNED, IN_TRANSIT y DELIVERED. DELIVERED requiere deliveredAt ISO. No sincroniza el estado del pedido; no se impone un flujo de transiciones.' : entity === 'Product' ? 'status se deriva del stock y no se admite en el body.' : 'Email normalizado a minúsculas; role por defecto USER.';
    paths[root] = {
      get: { tags: [tag], summary: 'Listar ' + plural, description: 'Devuelve data como array paginado, sin metadatos de total.', operationId: 'list' + tag, parameters: [...pagination, ...(statuses ? [param('status', enumeration(statuses), 'Filtrar por estado.')] : [])], responses: { ...success(array(ref(entity))), ...errors([...baseErrors,'VALIDATION_ERROR',...(statuses ? ['INVALID_STATUS'] : [])]) } },
      post: { tags: [tag], summary: 'Crear ' + entity, description: detail, operationId: 'create' + entity, requestBody: body(ref(entity + 'Input')), responses: { ...success(ref(entity),201), ...errors(writeErrors) } }
    };
    const missing = entity.toUpperCase() + '_NOT_FOUND';
    paths[root + '/{id}'] = {
      parameters: [param('id', id, 'ObjectId del recurso.', 'path')],
      get: { tags: [tag], summary: 'Consultar ' + entity, description: 'Consulta por ID.', operationId: 'get' + entity, responses: { ...success(ref(entity)), ...errors([...baseErrors,'INVALID_ID',missing]) } },
      patch: { tags: [tag], summary: 'Actualizar ' + entity, description: 'Body parcial no vacío. ' + detail, operationId: 'update' + entity, requestBody: body(ref(entity + 'Update')), responses: { ...success(ref(entity)), ...errors([...writeErrors,'INVALID_ID',missing]) } }
    };
    if (['User','Product'].includes(entity)) paths[root + '/{id}'].delete = { tags: [tag], summary: 'Eliminar ' + entity, description: 'Baja lógica. Respuesta sin body.', operationId: 'delete' + entity, responses: { 204: response('Eliminado, sin contenido.'), ...errors([...baseErrors,'INVALID_ID',missing]) } };
  }
  if (uploadsEnabled) {
    const resources = [
      ['users', 'documents', 'User', 'Users', 'USER_NOT_FOUND', true],
      ...(deliveriesEnabled ? [['deliveries', 'proofs', 'Delivery', 'Deliveries', 'DELIVERY_NOT_FOUND', false]] : [])
    ];
    for (const [resource, field, entity, tag, missing, userDocument] of resources) {
      const form = {
        file: str({ format: 'binary', description: 'PDF, JPEG o PNG de hasta 5 MiB.' }),
        ...(userDocument ? { documentType: enumeration(USER_DOCUMENT_TYPES) } : {})
      };
      const updated = obj({ ...schemas[entity].properties, [field]: array(ref('UploadMetadata')) },
        [...schemas[entity].required, field]);
      paths['/api/' + resource + '/{id}/' + field] = {
        parameters: [param('id', id, 'ID de la entidad.', 'path')],
        post: {
          tags: [tag],
          summary: userDocument ? 'Subir documento de usuario' : 'Asociar comprobante a una entrega',
          operationId: userDocument ? 'uploadUserDocument' : 'uploadDeliveryProof',
          requestBody: { required: true, content: { 'multipart/form-data': {
            schema: { ...obj(form, Object.keys(form)), additionalProperties: false },
            encoding: { file: { contentType: ACCEPTED_MIME_TYPES.join(', ') } }
          } } },
          responses: {
            ...success(updated, 201),
            ...errors([...baseErrors, ...parserErrors, missing, 'INVALID_ID', 'FILE_REQUIRED',
              'UNEXPECTED_FILE_FIELD', 'INVALID_FILE_TYPE', 'FILE_TOO_LARGE', 'INVALID_UPLOAD',
              'UPLOAD_MULTIPART_REQUIRED', 'UPLOAD_SAVE_FAILED', 'VALIDATION_ERROR',
              ...(userDocument ? ['INVALID_DOCUMENT_TYPE'] : [])])
          }
        }
      };
    }
  }
  if (mocksEnabled) {
    for (const resource of ['users','drivers','orders','deliveries','scenario']) {
      paths['/api/mocks/' + resource] = { get: { tags: ['Mocks', ...(resource === 'orders' ? ['Orders'] : resource === 'deliveries' ? ['Deliveries'] : [])], summary: 'Generar ' + resource + ' mock', description: 'Generación en memoria; no persiste. Solo admite qty. Orders devuelve users y orders; deliveries/scenario incluyen users, drivers, orders y deliveries. Los IDs relacionados están incluidos.', operationId: 'mock' + resource, parameters: [param('qty', { type: 'integer', minimum: 1, maximum: MOCK_LIMITS.MAX_PREVIEW_QTY, default: MOCK_LIMITS.DEFAULT_QTY }, 'Cantidad entera; rechaza 0, negativos, decimales, texto y parámetros repetidos.')], responses: { 200: response('Datos generados.', ['users','drivers'].includes(resource) ? array(ref('User')) : ref('Dataset')), ...errors(['INVALID_MOCK_QUANTITY','VALIDATION_ERROR','MOCK_GENERATION_FAILED','INTERNAL_ERROR']) } } };
    }
    paths['/api/mocks/seed'] = { post: { tags: ['Mocks'], summary: 'Insertar datos de prueba en MongoDB', description: 'Requiere MOCK_SEED_ENABLED=true y entorno development/test. qty y resource se reciben por query. No enviar body o enviar {}. Cualquier body con campos se rechaza. resource=all crea qty usuarios, qty repartidores, qty pedidos y qty entregas. No borra datos existentes.', operationId: 'seedMocks', parameters: [param('qty', { type: 'integer', minimum: 1, maximum: MOCK_LIMITS.MAX_SEED_QTY, default: MOCK_LIMITS.DEFAULT_QTY }, 'Cantidad base por recurso.'), param('resource', { ...enumeration(MOCK_RESOURCES), default: 'users' }, 'Recurso a generar.')], requestBody: { required: false, content: json({ type: 'object', additionalProperties: false, example: {} }) }, responses: { 201: response('Lote insertado.', ref('SeedResult')), ...errors([...parserErrors,'INVALID_MOCK_QUANTITY','INVALID_MOCK_RESOURCE','VALIDATION_ERROR','MOCK_SEED_DISABLED','MOCK_GENERATION_FAILED','MOCK_PERSISTENCE_FAILED','MOCK_CLEANUP_FAILED','DATABASE_UNAVAILABLE','DUPLICATE_RESOURCE','INTERNAL_ERROR']) } } };
  }
  if (loggerEnabled) paths['/api/logger-test'] = { get: { tags: ['Logger'], summary: 'Validar los seis niveles del logger', description: 'Herramienta de validación, no de negocio. Emite debug, http, info, warning, error y fatal. fatal es simulado y no detiene el servidor. Disponible fuera de production con LOGGER_TEST_ENABLED=true; al deshabilitarse devuelve 404 ROUTE_NOT_FOUND.', operationId: 'testLogger', responses: { 200: response('Prueba ejecutada.', ref('LoggerResult')), ...errors(['INTERNAL_ERROR']) } } };
  paths['/health'] = { get: { tags: ['Health'], summary: 'Comprobar proceso HTTP', description: 'No verifica conectividad actual con MongoDB.', operationId: 'health', responses: { 200: response('Proceso disponible.', obj({ status: str({ enum: ['ok'] }) }, ['status'])) } } };
  return { openapi: '3.0.3', info: { title: 'ShipNow API', version: '5.0.0', description: 'API de gestión de usuarios, productos, pedidos y entregas. Permite consultar y probar operaciones, generar datos de prueba y validar logging. No implementa autenticación; no requiere token ni devuelve 401. Los módulos deshabilitados se omiten de esta especificación y sus rutas devuelven 404 ROUTE_NOT_FOUND. JSON limitado a 100kb. Errores centralizados sin trazas internas.' }, servers: [{ url: '/', description: 'Servidor actual (local por defecto http://localhost:3000; usa el PORT configurado)' }, { url: 'http://localhost:3000', description: 'Servidor local por defecto' }], tags, paths, components: { schemas } };
}
