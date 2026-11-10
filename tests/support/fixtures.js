import { expect } from 'chai';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createConfiguredApp } from '../../src/configured-app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { validateEnv } from '../../src/config/env.config.js';
import { ERROR_DICTIONARY } from '../../src/errors/error-dictionary.js';

export const absentId = '000000000000000000000001';
export const objectId = /^[0-9a-f]{24}$/;
export const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const logEvents = [];
const log = {
  log(level, message, meta) { logEvents.push({ level, message, ...meta }); },
  http() {},
  info() {},
  debug() {},
  fatal() {}
};

let database;
let config;
export let api;

export function createTestApi(overrides = {}) {
  return request(createConfiguredApp({ ...config, ...overrides }, log));
}

export const mochaHooks = {
  async beforeAll() {
    this.timeout(180000);
    database = await MongoMemoryServer.create({
      binary: { version: '7.0.24' },
      instance: { ip: '127.0.0.1' }
    });
    config = validateEnv({ ...process.env, MONGODB_URI: database.getUri('shipnow_test') });
    await connectDatabase(config.mongodbUri, { log });
    api = createTestApi();
  },
  async afterEach() {
    logEvents.length = 0;
    if (mongoose.connection.readyState === 1) {
      await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
    }
  },
  async afterAll() {
    try {
      await disconnectDatabase();
    } finally {
      await database?.stop();
    }
  }
};

export async function expectApiError(call, status, code, {
  message = ERROR_DICTIONARY[code].message, details = null
} = {}) {
  const { body } = await call.expect(status).expect('Content-Type', /json/);
  expect(body).to.deep.equal({ status: 'error', error: { code, message, details } });
  return body;
}

export function expectRecord(record, fields) {
  expect(record).to.have.all.keys('_id', 'createdAt', 'updatedAt', ...Object.keys(fields));
  expect(record).to.deep.include(fields);
  expect(record._id).to.match(objectId);
  for (const field of ['createdAt', 'updatedAt']) {
    expect(record[field]).to.be.a('string');
    expect(new Date(record[field]).toISOString()).to.equal(record[field]);
  }
}

export async function createUser(overrides = {}) {
  const { body } = await api.post('/api/users')
    .send({ name: 'Ana de prueba', email: 'ana@example.test', ...overrides }).expect(201);
  return body.data;
}

export async function orderInput() {
  const user = await createUser();
  return {
    user: user._id,
    description: 'Caja de libros',
    pickupAddress: 'Origen 123',
    deliveryAddress: 'Destino 456',
    weightKg: 2.5,
    items: [{ description: 'Libro', quantity: 2 }]
  };
}

export async function createOrder(input) {
  const payload = input ?? await orderInput();
  const { body } = await api.post('/api/orders').send(payload).expect(201);
  return body.data;
}
