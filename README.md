# ShipNow — Pre-entrega Módulo 4: logging y monitoreo básico

API de prueba con Node.js, Express y Mongoose. Centraliza los errores de Usuarios, Productos y del módulo de mocks con **errores personalizados, un diccionario de códigos y un único middleware HTTP**. Conserva el mocking del módulo 2 para generar **usuarios, repartidores, pedidos y entregas** sin cargar datos reales a mano.

Esta entrega agrega **Winston** como logger centralizado, registros HTTP con identificador de solicitud, clasificación de errores, archivo persistente con rotación y un endpoint interno de prueba. Conserva el formato de error del módulo 3 y las funcionalidades de los módulos anteriores.

## Logging: cómo probar esta entrega

La configuración está en `src/config/logger.js`; las variables se leen únicamente desde `src/config/env.config.js`. Los niveles personalizados, de mayor a menor gravedad, son **fatal → error → warning → info → http → debug**. Todos los registros usan `YYYY-MM-DD HH:mm:ss [nivel] mensaje` y pueden incluir metadatos JSON.

| Entorno | Consola | Archivo de errores | Endpoint de prueba |
| --- | --- | --- | --- |
| `development` | Los seis niveles, desde `debug` | `error` y `fatal` | Habilitado salvo `LOGGER_TEST_ENABLED=false` |
| `production` | `info`, `warning`, `error`, `fatal` | `error` y `fatal` | Siempre deshabilitado, incluso con el flag en `true` |
| `test` | Silenciosa por defecto | Deshabilitado por defecto para aislar pruebas | Habilitable para pruebas HTTP |

En `.env` agregar o conservar:

```dotenv
NODE_ENV=development
LOGGER_TEST_ENABLED=true
LOG_DIR=logs
```

Con MongoDB disponible, ejecutar `npm ci` y `npm start`. Probar desde otra terminal PowerShell:

```powershell
Invoke-RestMethod 'http://localhost:3000/api/logger-test'
Get-Content ./logs/error.log -Tail 20
```

También puede usarse `curl http://localhost:3000/api/logger-test`. El endpoint emite un evento en cada uno de los seis niveles y devuelve `status`, `message`, `levels` y `requestId`. La línea `fatal` de esta prueba es **simulada**: no cierra el servidor. Los errores importantes quedan en `logs/error.log`; no se guardan allí `warning`, `info`, `http` ni `debug`.

La rotación usa el transporte `File` de Winston con `maxsize=5242880`, `maxFiles=5` y `tailable=true`: aproximadamente 5 MiB por archivo y hasta cinco archivos (`error.log`, `error1.log`, …, `error4.log`). Al superar el tamaño se desplazan los registros anteriores y se elimina el más antiguo. Una entrada individual puede hacer que se exceda el umbral antes del siguiente giro. `error.log` siempre corresponde al archivo activo. Se eligió rotación por tamaño y cantidad de archivos; no se requiere una dependencia extra ni enlaces simbólicos. Referencia: [transporte File de Winston](https://github.com/winstonjs/winston/blob/master/docs/transports.md#file-transport).

Se registran el inicio y cierre HTTP, conexión e índices de MongoDB, generación y persistencia de mocks (incluidos pedidos), creación/actualización de usuarios y productos, rutas inexistentes, validaciones y fallos inesperados. Este proyecto no tiene un CRUD HTTP de pedidos: sus pedidos se crean mediante el módulo de mocks y se registran allí. No se agrega una API de pedidos ajena a la consigna.

El middleware conserva las respuestas JSON del módulo 3: errores esperados `4xx` generan `warning`, fallos inesperados o de infraestructura `5xx` generan `error`, y un lote que no pudo limpiarse genera `fatal`. Un fallo inicial de configuración/conexión o del puerto también genera `fatal`. El cierre espera el vaciado del logger. Cada respuesta HTTP incluye `X-Request-Id` para relacionarla con sus logs; las líneas HTTP incluyen método, ruta sin query, estado y duración.

No se registran cuerpos HTTP, headers, contraseñas ni emails de entidades. Se filtran claves sensibles y se ocultan las URI de MongoDB antes de escribir; las causas y los stacks técnicos se conservan en los errores internos, sin devolverlos al cliente. No enviar credenciales dentro de la ruta de una URL.

`.gitignore` excluye `node_modules/`, `.env`, `.env.*`, `coverage/`, `*.log` y todo el contenido de `/logs/` salvo `.gitkeep`. Se conserva la carpeta vacía documentada; nunca se entregan los registros generados.

Pruebas:

```powershell
$env:NODE_ENV='test'
npm test
npm run check
npm run test:integration
```

En Linux/macOS usar `NODE_ENV=test npm test`. Las pruebas de logging verifican el filtrado por entorno, los niveles, formato, ocultamiento de secretos, persistencia exclusiva de `error/fatal`, rotación real, endpoint, middleware y eventos de mocks/MongoDB sin utilizar una base real. La suite de integración usa MongoDB efímero para comprobar las relaciones y persistencia de los módulos anteriores; su primera ejecución puede descargar el binario.

- Los `GET /api/mocks/*` generan datos en memoria y **no escriben en MongoDB**.
- `POST /api/mocks/seed` agrega un lote acotado de documentos a MongoDB.
- Se conserva la API de Usuarios y Productos del módulo 1.

## 1. Instalar y ejecutar

Requisitos: Node.js 22 o superior, npm y MongoDB local iniciado o una URI de MongoDB Atlas.

En PowerShell, desde la carpeta del proyecto:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

En Linux/macOS, reemplazar `Copy-Item` por `cp .env.example .env`. Para iniciar sin modo de desarrollo: `npm start`.

Editar `.env` si corresponde:

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/shipnow
NODE_ENV=development
MOCKS_ENABLED=true
MOCK_SEED_ENABLED=true
```

Si ya tenés el `.env` del módulo 1, agregar las dos variables `MOCKS_*` para habilitar la carga. Usar una base destinada a pruebas. El archivo real `.env` y `node_modules` están excluidos por `.gitignore`; `.env.example` y `package-lock.json` sí se versionan.

La configuración se valida antes de abrir HTTP. `PORT`, `MONGODB_URI` y `NODE_ENV` son obligatorios. Los flags aceptan únicamente `true` o `false`. Sin flags, los GET están habilitados en desarrollo/test y el seed está deshabilitado. En `NODE_ENV=production`, el router de mocks queda deshabilitado incluso si los flags son `true`.

El servidor espera la conexión y los índices de MongoDB antes de escuchar. Los GET no necesitan datos previamente guardados, aunque el servidor completo sí requiere una conexión al arrancar. Las pruebas unitarias y HTTP funcionan sin MongoDB.

## 2. Endpoints de mocking

Todos los ejemplos usan `http://localhost:3000`.

| Método | Ruta | Datos devueltos o insertados |
| --- | --- | --- |
| GET | `/api/mocks/users?qty=2` | Array de usuarios con roles válidos |
| GET | `/api/mocks/drivers?qty=2` | Array de usuarios con rol `DRIVER` |
| GET | `/api/mocks/orders?qty=5` | Objeto con 5 clientes y 5 pedidos vinculados |
| GET | `/api/mocks/deliveries?qty=5` | Objeto con 5 clientes, 5 repartidores, 5 pedidos y 5 entregas |
| GET | `/api/mocks/scenario?qty=5` | El mismo escenario completo, útil para probar relaciones |
| POST | `/api/mocks/seed?qty=10` | Inserta únicamente 10 usuarios |
| POST | `/api/mocks/seed?qty=5&resource=all` | Inserta todas las entidades relacionadas |

`qty` es un entero positivo; por defecto vale **10**. Máximo de previews: **1000**. Máximo de seed: **100** por entidad principal. Cantidades inválidas, parámetros repetidos y parámetros desconocidos devuelven `400` sin escribir datos.

### Usuarios y repartidores sin guardar

```powershell
Invoke-RestMethod 'http://localhost:3000/api/mocks/users?qty=2'
Invoke-RestMethod 'http://localhost:3000/api/mocks/drivers?qty=2'
```

Una respuesta de `/users` tiene esta forma; los IDs, nombres y emails varían:

```json
[
  { "_id": "507f1f77bcf86cd799439011", "name": "Ana Pérez", "email": "mock.507f1f77bcf86cd799439011@test.com", "role": "USER" },
  { "_id": "507f1f77bcf86cd799439012", "name": "Luis Gómez", "email": "mock.507f1f77bcf86cd799439012@test.com", "role": "DRIVER" }
]
```

Los nombres de campos y roles respetan **el modelo existente**, que usa `name`, `email` y `role`. `USER` representa al cliente y `DRIVER` al repartidor. `/users` alterna `USER`, `DRIVER` y `ADMIN`; `/drivers` fuerza únicamente `DRIVER`.

### Pedidos y entregas sin guardar

```powershell
$scenario = Invoke-RestMethod 'http://localhost:3000/api/mocks/scenario?qty=5'
$scenario.orders
$scenario.deliveries
```

Los endpoints de pedidos, entregas y escenario devuelven un objeto:

```json
{
  "users": [],
  "drivers": [],
  "orders": [],
  "deliveries": []
}
```

Las listas se completan con `qty` registros de cada entidad necesaria. `/orders` devuelve `drivers` y `deliveries` vacíos. Las dependencias se incluyen en la misma respuesta para poder resolver todos los IDs en memoria; llamadas GET distintas generan escenarios independientes.

## 3. Cargar registros en MongoDB

### Carga básica, como en la consigna

```powershell
Invoke-RestMethod 'http://localhost:3000/api/mocks/seed?qty=10' -Method Post
```

Ejemplo de respuesta (`201 Created`):

```json
{
  "insertados": 10,
  "coleccion": "usuarios",
  "colecciones": { "usuarios": 10, "pedidos": 0, "entregas": 0 },
  "repartidores": 3,
  "batchId": "identificador-unico-del-lote",
  "persistencia": "compensated"
}
```

### Carga del escenario completo

```powershell
Invoke-RestMethod 'http://localhost:3000/api/mocks/seed?qty=5&resource=all' -Method Post
```

Ejemplo de respuesta:

```json
{
  "insertados": 20,
  "colecciones": { "usuarios": 10, "pedidos": 5, "entregas": 5 },
  "repartidores": 5,
  "batchId": "identificador-unico-del-lote",
  "persistencia": "compensated"
}
```

Los repartidores son usuarios con otro rol y se guardan en la **misma colección**. `repartidores` describe un subconjunto de `usuarios`; no se suma nuevamente al total `insertados`.

| `resource` | Documentos agregados para `qty=n` |
| --- | --- |
| `users` (por defecto) | n usuarios de roles variados |
| `drivers` | n usuarios con rol DRIVER |
| `orders` | n clientes + n pedidos: 2n documentos |
| `deliveries` | n clientes + n repartidores + n pedidos + n entregas: 4n documentos |
| `all` | Escenario completo: 4n documentos |

`seed` usa parámetros de query; admite body vacío o `{}` y rechaza datos arbitrarios. **Cada llamada agrega un nuevo lote** con IDs, emails y `batchId` propios. No reemplaza ni vacía colecciones. `batchId` se almacena como `mockBatchId` en cada documento insertado y permite reconocer los registros del lote.

### Verificar la carga

Los modelos Mongoose usan las colecciones físicas `users`, `orders` y `deliveries`. Las etiquetas `usuarios`, `pedidos` y `entregas` de la respuesta son el resumen en español.

En `mongosh`, elegir la misma base indicada por `MONGODB_URI`:

```javascript
use shipnow
db.users.countDocuments()
db.orders.countDocuments()
db.deliveries.countDocuments()
// Usar el batchId devuelto por POST:
db.users.find({ mockBatchId: 'PEGAR_BATCH_ID' })
db.orders.find({ mockBatchId: 'PEGAR_BATCH_ID' })
db.deliveries.find({ mockBatchId: 'PEGAR_BATCH_ID' })
```

También se pueden consultar los usuarios cargados mediante `GET /api/users?page=1&limit=100`, que conserva el formato `{ "data": [...] }` del módulo 1.

### Manejo de fallos

Antes de escribir, el Repository valida todos los documentos con los modelos reales. Inserta primero usuarios, luego pedidos y por último entregas.

- En Atlas, replica sets o clústeres con soporte de transacciones: se usa una transacción; se confirma todo el lote o se revierte todo. La respuesta indica `persistencia: "transaction"`.
- En MongoDB standalone: se permite la carga con limpieza compensatoria. Si falla una inserción, se eliminan únicamente IDs de ese mismo lote, en orden inverso. La respuesta indica `persistencia: "compensated"`.

La limpieza de un standalone no ofrece la atomicidad de una transacción: un corte del proceso o una pérdida de conexión puede impedir completarla. Si una limpieza falla, se devuelve `503` (`MOCK_CLEANUP_FAILED`) con el identificador en `error.details.batchId` para revisar los documentos `mockBatchId` antes de reintentar. Para cargas atómicas entre colecciones, usar un replica set o Atlas.

## 4. Modelos, relaciones y constantes

| Entidad | Campos principales | Relación |
| --- | --- | --- |
| User | `name`, `email`, `role` | Cliente o repartidor según rol |
| Order | `user`, `description`, `pickupAddress`, `deliveryAddress`, `weightKg`, `status`, `priority` | `user` referencia un User cliente |
| Delivery | `order`, `driver`, `status`, `deliveredAt` | `order` referencia un Order; `driver` referencia un User repartidor o es null |

Los modelos agregan `createdAt` y `updatedAt` al persistir. El email de User es único y cada Order puede tener como máximo una Delivery, mediante un índice único sobre `Delivery.order`.

Todas las opciones del dominio se definen en `src/constants/index.js` con `Object.freeze`:

- `USER_ROLES`: `ADMIN`, `USER`, `DRIVER`. Se conservan los valores del módulo 1 y se agrega el rol de repartidor.
- `ORDER_STATUSES`: `PENDING`, `ASSIGNED`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.
- `ORDER_PRIORITIES`: `LOW`, `NORMAL`, `HIGH`.
- `DELIVERY_STATUSES`: `PENDING`, `ASSIGNED`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`.
- `DELIVERY_STATUS_BY_ORDER`: correspondencia explícita entre estado del pedido y de su entrega.

Los esquemas y generadores consumen estas constantes. Cada pedido generado pertenece a un cliente `USER`; los repartidores tienen rol `DRIVER`. Una entrega `ASSIGNED`, `IN_TRANSIT` o `DELIVERED` tiene un repartidor válido. Una entrega `PENDING` o `CANCELLED` se genera sin repartidor. Las entregas completadas tienen `deliveredAt`. El generador recorre los estados y elige prioridades permitidas; con `qty=5` aparecen los cinco estados.

Las relaciones de este módulo se construyen dentro del lote generado. Los campos `ref` de Mongoose permiten `populate`, pero no son claves foráneas de MongoDB; los futuros endpoints de pedidos/entregas también deberán validar sus propias relaciones.

## 5. Arquitectura por capas

Flujo: **Router → Controller → Service → Repository → Model**.

| Archivo | Responsabilidad |
| --- | --- |
| `src/routes/mock.routes.js` | Declara rutas; no genera ni persiste datos |
| `src/controllers/mock.controller.js` | Extrae query/body y construye la respuesta HTTP |
| `src/services/mock.service.js` | Valida cantidades, recursos y habilitación; organiza preview y seed |
| `src/services/mock-generator.js` | Genera datos y relaciones usando las constantes, sin Mongoose |
| `src/repositories/mock.repository.js` | Valida esquemas, inserta lotes y gestiona transacciones/limpieza |
| `src/models/user.model.js` | Esquema existente con rol DRIVER y marca opcional de lote |
| `src/models/order.model.js` | Esquema de pedidos |
| `src/models/delivery.model.js` | Esquema de entregas y referencias |
| `src/constants/index.js` | Roles, estados, prioridades, recursos y límites |
| `src/server.js` | Ensambla servicios/repositorios y conexión |
| `src/app.js` | Construye Express, integra `/api/mocks` y deriva rutas inexistentes al middleware |
| `src/errors/error-dictionary.js` | Define códigos, estados HTTP y mensajes públicos |
| `src/errors/domain-errors.js` | Errores personalizados del dominio |
| `src/errors/persistence-error.js` | Traduce fallos técnicos de persistencia sin responder HTTP |
| `src/utils/app-error.js` | Clase base con código, estado, mensaje, detalles y causa interna |
| `src/middlewares/error-handler.js` | Único emisor de respuestas HTTP de error |

Los Controllers, Services y Routes no importan Mongoose ni modelos. Los GET usan únicamente la generación en memoria; solo seed llama al Repository. El repartidor se modela como User con rol DRIVER para conservar una única identidad y colección de usuarios.

Esta API académica no incorpora autenticación. Los flags controlan la habilitación del módulo y se bloquean en producción; no sustituyen permisos de administrador en una aplicación real.

## 6. Pruebas

Sin MongoDB ni `.env`:

```powershell
npm run check
npm test
```

Verifican sintaxis, separación por capas, configuración, endpoints del módulo 1, cantidades, roles, referencias de mocks, esquemas reales, ausencia de escrituras en GET, seed habilitado/deshabilitado y manejo de fallos de persistencia. `test/errors.test.js` comprueba además el contrato HTTP uniforme, que las entradas inválidas no escriban datos, que las fallas de generación/carga estén controladas y que no se filtren causas técnicas.

Integración con procesos MongoDB temporales y aislados:

```powershell
npm run test:integration
```

`mongodb-memory-server` descarga un binario de MongoDB 7.0.24 si falta y ejecuta escenarios standalone y replica set. Necesita acceso a la descarga y un sistema que permita iniciar `mongod`; no usa ni modifica tu base de ShipNow. Verifica escrituras reales, `populate`, índices únicos, llamadas repetidas, reversión de un lote fallido y conservación de documentos anteriores.

## 7. API conservada del módulo 1

| Método | Ruta |
| --- | --- |
| GET | `/health` |
| GET, POST | `/api/users`, `/api/products` |
| GET, PATCH, DELETE | `/api/users/:id`, `/api/products/:id` |

Documentación detallada de CRUD y arquitectura previa: [Módulo 1](docs/modulo-1.md).

Todas las respuestas HTTP de error usan el contrato de la sección siguiente. Las respuestas exitosas de los módulos anteriores se conservan.

## 8. Manejo centralizado de errores (Módulo 3)

### Formato uniforme

Ejemplo: `GET /api/mocks/users?qty=-1` devuelve **400 Bad Request**:

```json
{
  "status": "error",
  "error": {
    "code": "INVALID_MOCK_QUANTITY",
    "message": "qty debe ser un entero dentro del rango permitido.",
    "details": { "field": "qty", "min": 1, "max": 1000 }
  }
}
```

`status` siempre vale `error`. `error.code` identifica el caso de forma estable; `error.message` es el mensaje público; `error.details` aporta información de validación o vale `null`. El estado HTTP se obtiene del diccionario. Este mismo formato cubre errores del dominio, rutas inexistentes, JSON inválido, límites del body, persistencia y fallas inesperadas. Nunca se envían `stack`, `cause`, cadenas de conexión ni mensajes técnicos originales. Un error desconocido responde `500 / INTERNAL_ERROR` con un mensaje genérico.

### Responsabilidad de cada capa

1. **Routes** solo declaran endpoints. **Controllers** extraen parámetros y responden únicamente cuando la operación es exitosa.
2. **Services** validan reglas de negocio y lanzan errores personalizados: `UserNotFoundError`, `ProductNotFoundError`, `InvalidStatusError`, `InvalidRoleError`, `InvalidMockQuantityError`, `InvalidMockResourceError`, `MockSeedDisabledError`, entre otros.
3. **Repositories** conocen Mongoose. Traducen errores de esquema, duplicados y conexión mediante `normalizePersistenceError`; el repositorio de mocks también controla consultas de topología, transacciones e inserciones. No construyen respuestas HTTP.
4. **Express 5** propaga los errores síncronos y los rechazos de las promesas devueltas por los controllers al middleware. El fallback de rutas utiliza `next(new RouteNotFoundError())`.
5. **errorHandler**, registrado al final de `app.js` y con cuatro argumentos, normaliza el error y emite la única respuesta de error. Si los headers ya fueron enviados, delega mediante `next(error)`.

`AppError` toma un código definido en `ERROR_DICTIONARY`; las clases del dominio extienden esa clase. Para agregar un caso se define su código/HTTP/mensaje en el diccionario, se crea una clase si representa un concepto del dominio y se lanza desde la capa responsable.

### Códigos principales

| HTTP | Código | Situación |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body incorrecto, campos no permitidos, paginación o esquema inválido |
| 400 | `INVALID_ID` | ID mal formado |
| 400 | `INVALID_STATUS`, `INVALID_ROLE` | Opción fuera de las constantes del dominio |
| 400 | `INVALID_MOCK_QUANTITY` | Cantidad negativa, cero, decimal, no numérica, repetida o superior al límite |
| 400 | `INVALID_MOCK_RESOURCE` | Recurso de mocks desconocido o repetido |
| 400 | `INVALID_JSON`, `INVALID_REQUEST` | JSON o solicitud HTTP mal formada |
| 403 | `MOCK_SEED_DISABLED` | Seed deshabilitado o bloqueado en producción |
| 404 | `USER_NOT_FOUND`, `PRODUCT_NOT_FOUND` | ID válido sin registro activo |
| 404 | `ROUTE_NOT_FOUND` | Endpoint inexistente o router de mocks apagado |
| 409 | `DUPLICATE_RESOURCE` | Índice único de MongoDB rechaza un duplicado |
| 413 | `PAYLOAD_TOO_LARGE` | Body mayor de 100 KB |
| 415 | `UNSUPPORTED_ENCODING` | Codificación no admitida por el parser |
| 500 | `MOCK_GENERATION_FAILED` | Fallo durante la generación de datos de prueba |
| 500 | `MOCK_PERSISTENCE_FAILED` | Fallo inesperado al cargar mocks |
| 500 | `INTERNAL_ERROR` | Cualquier otro error inesperado |
| 503 | `DATABASE_UNAVAILABLE` | Conexión o servicio MongoDB no disponible |
| 503 | `MOCK_CLEANUP_FAILED` | Falló una carga y no se pudo completar su limpieza |

### Probar entradas inválidas desde PowerShell

Con la API iniciada y los mocks habilitados como en la sección 1, ejecutar `curl.exe -i` para ver el estado HTTP y el JSON. En Linux/macOS usar `curl`.

```powershell
# 400 / INVALID_MOCK_QUANTITY: negativo, decimal, texto y límite de seed
curl.exe -i 'http://localhost:3000/api/mocks/users?qty=-1'
curl.exe -i 'http://localhost:3000/api/mocks/orders?qty=1.5'
curl.exe -i 'http://localhost:3000/api/mocks/deliveries?qty=abc'
curl.exe -i -X POST 'http://localhost:3000/api/mocks/seed?qty=101'

# 400 / INVALID_MOCK_RESOURCE y VALIDATION_ERROR
curl.exe -i -X POST 'http://localhost:3000/api/mocks/seed?resource=invalid'
curl.exe -i 'http://localhost:3000/api/mocks/users?typo=2'

# 400 / INVALID_ID e INVALID_STATUS
curl.exe -i 'http://localhost:3000/api/users/id-invalido'
curl.exe -i 'http://localhost:3000/api/products?status=INVALID'

# 404 / USER_NOT_FOUND: usar un ID válido que no exista en tu base
curl.exe -i 'http://localhost:3000/api/users/000000000000000000000000'

# 404 / ROUTE_NOT_FOUND y 400 / INVALID_JSON
curl.exe -i 'http://localhost:3000/no-existe'
curl.exe -i -X POST -H 'Content-Type: application/json' --data '{' 'http://localhost:3000/api/users'
```

Para comprobar el bloqueo de seed, cambiar `MOCK_SEED_ENABLED=false`, reiniciar y llamar a `POST /api/mocks/seed?qty=1`: devuelve `403 / MOCK_SEED_DISABLED`. Las cantidades se validan en el service **antes de generar o persistir**: previews aceptan 1–1000, seed 1–100 y la cantidad por defecto es 10. El recurso también se valida antes de operar. El body de seed solo puede estar ausente o ser `{}`.

### Probar fallas de generación y MongoDB

```powershell
npm run check
npm test
npm run test:integration
```

`npm test` funciona sin MongoDB y reproduce fallos mediante dependencias inyectadas en tests: generador roto (`MOCK_GENERATION_FAILED`), fallo al consultar topología o insertar por red (`DATABASE_UNAVAILABLE`), duplicado (`DUPLICATE_RESOURCE`), esquema inválido (`VALIDATION_ERROR`), inserción inesperada (`MOCK_PERSISTENCE_FAILED`) y limpieza fallida (`MOCK_CLEANUP_FAILED`). Comprueba el estado y la estructura JSON por HTTP, y que la causa técnica quede oculta. No hay endpoints para forzar fallas en la API.

`npm run test:integration` usa MongoDB temporal standalone y replica set. Fuerza un conflicto real del índice único de entregas después de insertar usuarios/pedidos, comprueba `409 / DUPLICATE_RESOURCE` por HTTP y verifica que se reviertan los nuevos registros y se conserven los previos. También prueba esquemas inválidos antes de escribir. Requiere descargar el binario descrito en la sección 6.

Para una comprobación manual de disponibilidad, iniciar la API contra un MongoDB **local de pruebas** y luego detener esa instancia: una carga posterior responde `503 / DATABASE_UNAVAILABLE` si no llegó a escribir. Si la conexión se pierde durante una carga standalone y también impide limpiar, responde `503 / MOCK_CLEANUP_FAILED` con `error.details.batchId`; revisar ese lote antes de repetir la operación. Si MongoDB ya está caído al iniciar, el servidor no abre HTTP, como en los módulos anteriores.

Referencias oficiales: [Express: manejo de errores](https://expressjs.com/en/guide/error-handling/), [Mongoose: transacciones](https://mongoosejs.com/docs/transactions.html) y [Mongoose: modelos e insertMany](https://mongoosejs.com/docs/api/model.html).
