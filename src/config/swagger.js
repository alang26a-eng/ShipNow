import swaggerUi from 'swagger-ui-express';
import { buildOpenApi } from '../docs/openapi.js';
export function mountSwagger(app, options) {
  const spec = buildOpenApi(options);
  app.get('/api/docs.json', (req, res) => res.json(spec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'ShipNow API — Swagger', swaggerOptions: { docExpansion: 'none', displayRequestDuration: true } }));
}
