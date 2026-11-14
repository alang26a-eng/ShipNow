import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DOCUMENT_FOLDERS, PROOF_TYPE, UPLOAD_ROOT, USER_DOCUMENT_TYPES, uploadMetadata } from '../config/uploads.js';
import { AppError } from '../utils/app-error.js';
import { assertId } from '../utils/validation.js';

export function createUploadService({ users, deliveries, root = UPLOAD_ROOT }) {
  async function save(repository, collection, missing, id, file, documentType, log, requestId) {
    assertId(id);
    if (!await repository.findById(id)) throw new AppError(missing);

    const metadata = uploadMetadata(file, documentType);
    const target = path.join(root, DOCUMENT_FOLDERS[documentType], metadata.filename);
    let created = false;
    try {
      await mkdir(path.dirname(target), { recursive: true });
      const handle = await open(target, 'wx');
      created = true;
      try {
        await handle.writeFile(file.buffer);
      } finally {
        await handle.close();
      }
      const entity = await repository.appendUpload(id, collection, metadata);
      if (!entity) throw new AppError(missing);
      return entity;
    } catch (cause) {
      if (created) {
        try {
          await unlink(target);
        } catch (cleanupError) {
          log.log('error', 'No se pudo eliminar un archivo sin asociar', {
            requestId, entityId: id, filename: metadata.filename, error: cleanupError
          });
        }
      }
      if (cause instanceof AppError) throw cause;
      throw new AppError('UPLOAD_SAVE_FAILED', { cause });
    }
  }

  return {
    saveDocument(id, file, body, log, requestId) {
      if (!USER_DOCUMENT_TYPES.includes(body.documentType)) throw new AppError('INVALID_DOCUMENT_TYPE');
      if (Object.keys(body).length !== 1) throw new AppError('INVALID_UPLOAD');
      return save(users, 'documents', 'USER_NOT_FOUND', id, file, body.documentType, log, requestId);
    },
    saveProof(id, file, body, log, requestId) {
      if (Object.keys(body).length) throw new AppError('INVALID_UPLOAD');
      return save(deliveries, 'proofs', 'DELIVERY_NOT_FOUND', id, file, PROOF_TYPE, log, requestId);
    }
  };
}
