import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { AppError } from '../utils/app-error.js';

export const UPLOAD_ROOT = fileURLToPath(new URL('../../uploads/', import.meta.url));
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const DOCUMENT_FOLDERS = Object.freeze({
  DNI: 'documentos',
  LICENCIA: 'licencias',
  OTRO: 'documentos',
  COMPROBANTE_ENTREGA: 'comprobantes'
});
export const USER_DOCUMENT_TYPES = Object.freeze(['DNI', 'LICENCIA', 'OTRO']);
export const PROOF_TYPE = 'COMPROBANTE_ENTREGA';
const formats = {
  'application/pdf': { extension: '.pdf', signature: Buffer.from('%PDF-') },
  'image/jpeg': { extension: '.jpg', signature: Buffer.from('ffd8ff', 'hex') },
  'image/png': { extension: '.png', signature: Buffer.from('89504e470d0a1a0a', 'hex') }
};
export const ACCEPTED_MIME_TYPES = Object.freeze(Object.keys(formats));

const parse = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE + 1, files: 1, fields: 1, fieldSize: 64 },
  fileFilter(req, file, callback) {
    if (!ACCEPTED_MIME_TYPES.includes(file.mimetype)) return callback(new AppError('INVALID_FILE_TYPE'));
    callback(null, true);
  }
}).single('file');

export function receiveUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next(new AppError('UPLOAD_MULTIPART_REQUIRED'));
  parse(req, res, error => {
    if (error instanceof AppError) return next(error);
    if (error?.code === 'LIMIT_FILE_SIZE') return next(new AppError('FILE_TOO_LARGE'));
    if (['LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'].includes(error?.code)) {
      return next(new AppError('UNEXPECTED_FILE_FIELD'));
    }
    if (error) return next(new AppError('INVALID_UPLOAD', { cause: error }));
    if (!req.file || req.file.size === 0) return next(new AppError('FILE_REQUIRED'));
    if (req.file.size > MAX_FILE_SIZE) return next(new AppError('FILE_TOO_LARGE'));
    const { buffer, mimetype } = req.file;
    const { signature } = formats[mimetype];
    if (!buffer.subarray(0, signature.length).equals(signature)) {
      return next(new AppError('INVALID_FILE_TYPE'));
    }
    next();
  });
}

export function uploadMetadata(file, documentType) {
  const filename = randomUUID() + formats[file.mimetype].extension;
  return {
    originalName: file.originalname,
    filename,
    path: path.posix.join('uploads', DOCUMENT_FOLDERS[documentType], filename),
    mimeType: file.mimetype,
    size: file.size,
    documentType,
    uploadedAt: new Date()
  };
}
