# ShipNow — Pre-entrega Módulo 2

API de prueba con Node.js, Express y Mongoose. Integra un módulo de mocking a la arquitectura del módulo 1 para generar **usuarios, repartidores, pedidos y entregas** sin cargar datos reales a mano.

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

La limpieza de un standalone no ofrece la atomicidad de una transacción: un corte del proceso o una pérdida de conexión puede impedir completarla. Si una limpieza falla, se devuelve `503` con el identificador del lote para revisar los documentos `mockBatchId` antes de reintentar. Para cargas atómicas entre colecciones, usar un replica set o Atlas.

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
| `src/app.js` | Construye Express e integra `/api/mocks` |

Los Controllers, Services y Routes no importan Mongoose ni modelos. Los GET usan únicamente la generación en memoria; solo seed llama al Repository. El repartidor se modela como User con rol DRIVER para conservar una única identidad y colección de usuarios.

Esta API académica no incorpora autenticación. Los flags controlan la habilitación del módulo y se bloquean en producción; no sustituyen permisos de administrador en una aplicación real.

## 6. Pruebas

Sin MongoDB ni `.env`:

```powershell
npm run check
npm test
```

Verifican sintaxis, separación por capas, configuración, endpoints del módulo 1, cantidades, roles, referencias de mocks, esquemas reales, ausencia de escrituras en GET, seed habilitado/deshabilitado y manejo de fallos de persistencia.

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

Errores de mocks: `400` entrada inválida; `403` seed deshabilitado; `404` router apagado o ruta inexistente; `409` conflicto de unicidad; `503` base no disponible o limpieza incompleta; `500` error inesperado. Formato: `{ "error": "mensaje" }`.

Referencias oficiales: [Express: manejo de errores](https://expressjs.com/en/guide/error-handling/), [Mongoose: transacciones](https://mongoosejs.com/docs/transactions.html) y [Mongoose: modelos e insertMany](https://mongoosejs.com/docs/api/model.html).
