import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'chai';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { MAX_FILE_SIZE } from '../src/config/uploads.js';
import { absentId, api, createOrder, createTestApi, createUser, expectApiError } from './support/fixtures.js';

const pdf = Buffer.from('%PDF-1.4\n%%EOF\n');
const attachPdf = (call, field = 'file', bytes = pdf) =>
  call.attach(field, bytes, { filename: 'archivo.pdf', contentType: 'application/pdf' });

describe('Carga de archivos', () => {
  let root;
  let uploadApi;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'shipnow-uploads-'));
    uploadApi = createTestApi({ uploadRoot: root });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('guarda el documento y permite consultar sus metadatos en el usuario', async () => {
    const { _id } = await createUser();
    const route = '/api/users/' + _id;
    const { body } = await attachPdf(uploadApi.post(route + '/documents'))
      .field('documentType', 'LICENCIA').expect(201);
    const [document] = body.data.documents;
    expect(document).to.have.all.keys('originalName', 'filename', 'path', 'mimeType', 'size', 'documentType', 'uploadedAt');
    expect(document).to.include({ originalName: 'archivo.pdf', mimeType: 'application/pdf', size: pdf.length, documentType: 'LICENCIA' });
    expect(document.path).to.equal('uploads/licencias/' + document.filename);
    expect(await readFile(path.join(root, 'licencias', document.filename))).to.deep.equal(pdf);
    expect((await api.get(route).expect(200)).body.data.documents).to.deep.equal([document]);
  });

  it('guarda el comprobante y lo asocia a la entrega', async () => {
    const order = await createOrder();
    const { body } = await api.post('/api/deliveries').send({ order: order._id }).expect(201);
    const route = '/api/deliveries/' + body.data._id;
    const uploaded = await attachPdf(uploadApi.post(route + '/proofs')).expect(201);
    const [proof] = uploaded.body.data.proofs;
    expect(proof.documentType).to.equal('COMPROBANTE_ENTREGA');
    expect(await readFile(path.join(root, 'comprobantes', proof.filename))).to.deep.equal(pdf);
    expect((await api.get(route).expect(200)).body.data.proofs).to.deep.equal([proof]);
  });

  it('rechaza la falta de archivo y el tipo de documento inválido', async () => {
    const route = '/api/users/' + (await createUser())._id + '/documents';
    await expectApiError(uploadApi.post(route).field('documentType', 'DNI'), 400, 'FILE_REQUIRED');
    await expectApiError(attachPdf(uploadApi.post(route)).field('documentType', 'INVÁLIDO'), 400, 'INVALID_DOCUMENT_TYPE');
    expect(await readdir(root)).to.deep.equal([]);
  });

  it('rechaza campos incorrectos, contenido inválido y archivos demasiado grandes', async () => {
    const route = '/api/users/' + (await createUser())._id + '/documents';
    await expectApiError(attachPdf(uploadApi.post(route), 'archivo'), 400, 'UNEXPECTED_FILE_FIELD');
    await expectApiError(attachPdf(uploadApi.post(route), 'file', Buffer.from('texto')), 415, 'INVALID_FILE_TYPE');
    await expectApiError(attachPdf(uploadApi.post(route), 'file', Buffer.alloc(MAX_FILE_SIZE + 1)), 413, 'FILE_TOO_LARGE');
    expect(await readdir(root)).to.deep.equal([]);
  });

  it('rechaza comprobantes de entregas inexistentes', async () => {
    await expectApiError(attachPdf(uploadApi.post('/api/deliveries/' + absentId + '/proofs')), 404, 'DELIVERY_NOT_FOUND');
    expect(await readdir(root)).to.deep.equal([]);
  });

  it('responde con el error centralizado cuando falla la escritura', async () => {
    const route = '/api/users/' + (await createUser())._id;
    await writeFile(path.join(root, 'documentos'), 'bloquea la creación de la carpeta');
    await expectApiError(attachPdf(uploadApi.post(route + '/documents')).field('documentType', 'DNI'), 500, 'UPLOAD_SAVE_FAILED');
    expect((await api.get(route).expect(200)).body.data).not.to.have.property('documents');
  });
});
