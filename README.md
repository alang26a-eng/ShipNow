# ShipNow — Pre-entrega Módulo 1

API de Usuarios y Productos creada desde cero con Node.js, Express y Mongoose.

## Requisitos y ejecución

- Node.js 22 o superior y npm.
- MongoDB local o una URI de MongoDB Atlas para usar la API con persistencia.

Desde la carpeta ShipNow:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

En macOS/Linux, usar `cp .env.example .env`. Editar el archivo local `.env` si la conexión es distinta.
El ejemplo usa MongoDB local, no contiene credenciales. MongoDB debe estar iniciado.
Para ejecutar sin modo de desarrollo: `npm start`.

Variables obligatorias:

| Variable | Validación |
| --- | --- |
| PORT | Entero de 1 a 65535 |
| MONGODB_URI | Prefijo mongodb:// o mongodb+srv://; la conexión comprueba la URI y disponibilidad |
| NODE_ENV | development, test o production |

`src/config/env.config.js` centraliza dotenv y exporta `loadConfig()`, que devuelve el objeto validado e inmutable.
No hay lecturas de `process.env` en otros archivos.
Si falta una variable, el proceso termina con código 1 y un mensaje que identifica la variable, antes de conectar a MongoDB o abrir HTTP.
El servidor solo escucha después de conectar y crear los índices.

## Arquitectura

```text
src/
  config/          env.config.js, database.js
  constants/       index.js
  controllers/     product.controller.js, user.controller.js
  services/        product.service.js, user.service.js
  repositories/    base.repository.js, product.repository.js, user.repository.js
  models/          product.model.js, user.model.js
  routes/          product.routes.js, user.routes.js
  middlewares/     error-handler.js
  utils/           app-error.js, validation.js
  app.js
  server.js
test/
scripts/check.js
```

Flujo: Route → Controller → Service → Repository → Mongoose Model.

- **Controller:** recibe parámetros HTTP, llama al Service y determina el código y cuerpo de respuesta.
- **Service:** aplica reglas del dominio: precio y stock no negativos, stock entero, estado derivado del stock, email normalizado, roles válidos y recurso inexistente. No conoce Express ni Mongoose.
- **Repository:** encapsula consultas, proyecciones explícitas, paginación, orden estable, baja lógica y traducción de errores de persistencia. No calcula estados ni decide permisos. La implementación compartida evita duplicación; cada entidad define su modelo y campos públicos.
- **Model:** declara el esquema de almacenamiento y sus restricciones. La conexión está aislada en config/database.js.
- **server.js:** ensambla las dependencias. **app.js:** construye Express sin conectarse a MongoDB, para poder probarlo.

Service vs Repository: decidir que stock cero implica OUT_OF_STOCK es negocio y pertenece al Service.
Buscar únicamente documentos no eliminados y aplicar una proyección es acceso a datos y pertenece al Repository.

Roles y estados usan objetos Object.freeze en src/constants/index.js.
El cliente no puede escribir status ni deletedAt. Una actualización de stock persiste stock y status juntos.
DELETE realiza una baja lógica: el registro deja de aparecer en consultas públicas.
El email tiene índice único y sigue reservado después de la baja, evitando reutilización accidental.

## Endpoints

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /health | 200, estado del proceso HTTP |
| GET | /api/products | 200, lista |
| GET | /api/products/:id | 200 o 404 |
| POST | /api/products | 201 |
| PATCH | /api/products/:id | 200 |
| DELETE | /api/products/:id | 204 sin cuerpo |
| GET | /api/users | 200, lista |
| GET | /api/users/:id | 200 o 404 |
| POST | /api/users | 201 |
| PATCH | /api/users/:id | 200 |
| DELETE | /api/users/:id | 204 sin cuerpo |

Listas: `?page=1&limit=20` (máximo 100). Products permite `?status=AVAILABLE` o `?status=OUT_OF_STOCK`.
Respuestas de datos: `{"data": ...}`. Errores: `{"error":"mensaje"}`.
400: entrada inválida; 404: recurso/ruta inexistente; 409: email duplicado; 413: cuerpo demasiado grande; 500: error inesperado.

Ejemplos en PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health
$product = Invoke-RestMethod http://localhost:3000/api/products -Method Post -ContentType 'application/json' -Body '{"name":"Caja","price":1500,"stock":10}'
Invoke-RestMethod "http://localhost:3000/api/products/$($product.data._id)" -Method Patch -ContentType 'application/json' -Body '{"stock":0}'
Invoke-RestMethod http://localhost:3000/api/users -Method Post -ContentType 'application/json' -Body '{"name":"Ana","email":"ana@example.com"}'
```

Products requiere name, price y stock. Users requiere name y email; role es opcional y toma USER por defecto.
PATCH admite los mismos campos parcialmente. No acepta campos desconocidos ni cuerpos vacíos.
Esta entrega no implementa autenticación ni autorización: role es un dato del dominio y puede editarse mediante esta API académica. Agregar control de acceso antes de exponerla públicamente.
No se almacenan contraseñas. /health no comprueba la disponibilidad posterior de MongoDB.

## Verificación sin MongoDB

```powershell
npm run check
npm test
```

Se verifica sintaxis, límites de importación, centralización de variables, configuración inválida y salida del proceso.
Las pruebas HTTP usan los Controllers y Services reales con repositorios en memoria.
Las pruebas de repositorios verifican filtros, proyecciones, opciones de actualización y traducción de errores mediante dobles.
No requieren .env ni credenciales. No sustituyen una prueba de integración contra MongoDB real.

Decisiones técnicas basadas en documentación oficial:
[Express 5: errores asíncronos](https://expressjs.com/en/guide/error-handling/) y
[Mongoose: validación de actualizaciones e índices únicos](https://mongoosejs.com/docs/validation).

## Subir a GitHub

Crear un repositorio vacío llamado ShipNow en GitHub. Desde esta carpeta:

```powershell
git init
git add .
git status
git commit -m "Crear API ShipNow por capas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ShipNow.git
git push -u origin main
```

Reemplazar TU_USUARIO. .gitignore excluye .env, node_modules y logs; .env.example y package-lock.json sí se versionan.
No subir credenciales reales. El proyecto se entrega preparado localmente; estos pasos publican el repositorio en tu cuenta.
