import winston from 'winston';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finished } from 'node:stream/promises';
import { getLoggingConfig } from './env.config.js';

// Winston usa menor número para mayor gravedad. error incluye también fatal.
export const LOG_LEVELS = Object.freeze({ fatal: 0, error: 1, warning: 2, info: 3, http: 4, debug: 5 });
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const secretKeys = /password|passwd|secret|token|authorization|cookie|mongodburi/i;

function cleanText(value) {
  return value.replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MONGODB_URI_REDACTED]')
    .replace(/\r?\n/g, '\\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}
function sanitize(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return cleanText(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value) || depth > 8) return '[Circular/limit]';
  seen.add(value);
  if (value instanceof Error) return {
    name: value.name, message: cleanText(value.message),
    ...(value.code !== undefined ? { code: value.code } : {}),
    ...(value.stack ? { stack: cleanText(value.stack) } : {}),
    ...(value.cause ? { cause: sanitize(value.cause, seen, depth + 1) } : {})
  };
  if (Array.isArray(value)) return value.map(item => sanitize(item, seen, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, secretKeys.test(key) ? '[REDACTED]' : sanitize(item, seen, depth + 1)]));
}
const scrub = winston.format(info => {
  for (const key of Object.keys(info)) info[key] = secretKeys.test(key) ? '[REDACTED]' : sanitize(info[key]);
  return info;
});
const line = winston.format.printf(({ timestamp, level, message, ...metadata }) =>
  `${timestamp} [${level}] ${message}${Object.keys(metadata).length ? ' ' + JSON.stringify(metadata) : ''}`);

function makeTransports({ nodeEnv = 'development', logDir = 'logs', consoleEnabled = nodeEnv !== 'test',
  fileEnabled = nodeEnv !== 'test', maxSize = 5 * 1024 * 1024, maxFiles = 5 } = {}) {
  const transports = [];
  if (consoleEnabled) transports.push(new winston.transports.Console({
    level: nodeEnv === 'production' ? 'info' : 'debug', stderrLevels: ['fatal', 'error'], consoleWarnLevels: ['warning']
  }));
  if (fileEnabled) {
    const directory = resolve(projectRoot, logDir);
    mkdirSync(directory, { recursive: true });
    transports.push(new winston.transports.File({
      filename: resolve(directory, 'error.log'), level: 'error',
      maxsize: maxSize, maxFiles, tailable: true, lazy: true
    }));
  }
  // En tests se conserva un transporte silencioso, sin archivos ni salida de consola.
  if (!transports.length) transports.push(new winston.transports.Console({ silent: true }));
  return transports;
}
function loggerOptions(options) {
  return { levels: LOG_LEVELS, level: 'debug',
    format: winston.format.combine(winston.format.errors({ stack: true }), scrub(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), line),
    transports: makeTransports(options), exitOnError: false };
}
export function createLogger(options = {}) {
  const instance = winston.createLogger(loggerOptions(options));
  // Un fallo del disco no debe generar otro log recursivo ni perderse silenciosamente.
  instance.on('error', () => { process.stderr.write('ShipNow: no se pudo escribir un registro de log.\n'); });
  return instance;
}
export const logger = createLogger(getLoggingConfig());
export function configureLogger(options) { logger.configure(loggerOptions(options)); return logger; }
export async function closeLogger(instance = logger) {
  const done = finished(instance, { readable: false });
  instance.end();
  await done;
  instance.close();
}
export default logger;
