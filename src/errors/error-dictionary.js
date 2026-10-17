// Contrato público: los clientes pueden usar code sin depender del texto del mensaje.
export const ERROR_DICTIONARY = Object.freeze(Object.fromEntries(Object.entries({
  VALIDATION_ERROR: { status: 400, message: 'Los datos recibidos son inválidos.' },
  INVALID_ID: { status: 400, message: 'ID inválido.' },
  INVALID_STATUS: { status: 400, message: 'Estado inválido.' },
  INVALID_ROLE: { status: 400, message: 'Rol inválido.' },
  USER_NOT_FOUND: { status: 404, message: 'Usuario no encontrado.' },
  PRODUCT_NOT_FOUND: { status: 404, message: 'Producto no encontrado.' },
  ROUTE_NOT_FOUND: { status: 404, message: 'Ruta no encontrada.' },
  DUPLICATE_RESOURCE: { status: 409, message: 'El valor único ya está registrado.' },
  INVALID_MOCK_QUANTITY: { status: 400, message: 'qty debe ser un entero dentro del rango permitido.' },
  INVALID_MOCK_RESOURCE: { status: 400, message: 'El recurso de mocks solicitado es inválido.' },
  MOCK_SEED_DISABLED: { status: 403, message: 'Carga de mocks deshabilitada. Usá MOCK_SEED_ENABLED=true en desarrollo o test.' },
  MOCK_GENERATION_FAILED: { status: 500, message: 'No se pudieron generar los datos de prueba.' },
  MOCK_PERSISTENCE_FAILED: { status: 500, message: 'No se pudo completar la carga de mocks en MongoDB.' },
  MOCK_CLEANUP_FAILED: { status: 503, message: 'No se pudo completar ni limpiar el lote. Revisá MongoDB antes de reintentar.' },
  DATABASE_UNAVAILABLE: { status: 503, message: 'MongoDB no está disponible.' },
  INVALID_JSON: { status: 400, message: 'JSON inválido.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Cuerpo de solicitud demasiado grande.' },
  UNSUPPORTED_ENCODING: { status: 415, message: 'Codificación de la solicitud no soportada.' },
  INVALID_REQUEST: { status: 400, message: 'Solicitud HTTP inválida.' },
  INTERNAL_ERROR: { status: 500, message: 'Error interno del servidor.' }
}).map(([code, definition]) => [code, Object.freeze(definition)])));
