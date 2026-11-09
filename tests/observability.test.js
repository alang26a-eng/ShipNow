import SwaggerParser from '@apidevtools/swagger-parser';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import { absentId, api, createTestApi, expectApiError, logEvents, uuid } from './support/fixtures.js';

describe('Logger y disponibilidad', () => {
  it('GET /api/logger-test emite los seis niveles con el mismo ID de solicitud', async () => {
    const { body, headers } = await api.get('/api/logger-test').expect(200).expect('Content-Type', /json/);
    const levels = ['debug', 'http', 'info', 'warning', 'error', 'fatal'];
    expect(headers['x-request-id']).to.match(uuid);
    expect(body).to.deep.equal({
      status: 'ok',
      message: 'Prueba de logging ejecutada. fatal es simulado; no detiene el servidor.',
      levels,
      requestId: headers['x-request-id']
    });
    expect(logEvents).to.deep.equal(levels.map(level => ({
      level, message: 'Prueba de logger: ' + level,
      event: 'logger_test', requestId: body.requestId, simulated: true
    })));
    expect((await api.get('/health').expect(200).expect('Content-Type', /json/)).body).to.deep.equal({ status: 'ok' });
  });

  it('GET /api/logger-test devuelve 404 si está deshabilitado y Swagger omite la operación', async () => {
    const disabled = createTestApi({ loggerTestEnabled: false });
    await expectApiError(disabled.get('/api/logger-test'), 404, 'ROUTE_NOT_FOUND');
    expect(logEvents.some(event => event.event === 'logger_test')).to.be.false;
    const { body } = await disabled.get('/api/docs.json').expect(200);
    expect(body.paths).not.to.have.property('/api/logger-test');
  });

  it('una ruta inexistente devuelve el formato de error de la API', async () => {
    await expectApiError(api.get('/ruta-inexistente'), 404, 'ROUTE_NOT_FOUND');
  });
});

describe('Swagger', () => {
  it('redirige a Swagger UI y sirve el HTML y sus recursos', async () => {
    await api.get('/api/docs').redirects(0).expect(301).expect('Location', '/api/docs/');
    const { text } = await api.get('/api/docs/').expect(200).expect('Content-Type', /html/);
    expect(text).to.include('ShipNow API').and.to.include('id="swagger-ui"');
    const css = await api.get('/api/docs/swagger-ui.css').expect(200).expect('Content-Type', /css/);
    expect(css.text).to.include('.swagger-ui');
    const script = await api.get('/api/docs/swagger-ui-bundle.js').expect(200).expect('Content-Type', /javascript/);
    expect(script.text).to.include('SwaggerUIBundle');
  });

  it('GET /api/docs.json publica OpenAPI válido y el 404 de pedido coincide con la respuesta real', async () => {
    const { body } = await api.get('/api/docs.json').expect(200).expect('Content-Type', /json/);
    expect(body.openapi).to.equal('3.0.3');
    expect(body.info.title).to.equal('ShipNow API');
    expect(body.paths).to.include.all.keys('/api/users', '/api/orders', '/api/orders/{id}', '/api/deliveries',
      '/api/mocks/seed', '/api/logger-test', '/api/products', '/health');
    expect(body.components.schemas).to.include.all.keys('Order', 'ErrorResponse');
    await SwaggerParser.validate(structuredClone(body));

    const notFound = await expectApiError(api.get('/api/orders/' + absentId), 404, 'ORDER_NOT_FOUND');
    const response = body.paths['/api/orders/{id}'].get.responses['404'].content['application/json'];
    expect(response.schema).to.deep.equal({ $ref: '#/components/schemas/ErrorResponse' });
    expect(response.examples.ORDER_NOT_FOUND.value).to.deep.equal(notFound);
  });

  it('devuelve 404 para una ruta de documentación inexistente y un método no admitido por OpenAPI JSON', async () => {
    await expectApiError(api.get('/api/docs-inexistente'), 404, 'ROUTE_NOT_FOUND');
    await expectApiError(api.post('/api/docs.json'), 404, 'ROUTE_NOT_FOUND');
  });
});
