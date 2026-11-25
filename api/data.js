import { assertSameOrigin, readJson, sendJson } from '../server/http.js';
import { requireAdmin, requireSession } from '../server/auth.js';
import {
  DataConflictError,
  DataValidationError,
  MAX_PAYLOAD_BYTES,
  PayloadTooLargeError,
  getSharedBackup,
  getSharedData,
  saveSharedData
} from '../server/data.js';

function queryParam(req, key) {
  if (req.query && typeof req.query === 'object' && Object.prototype.hasOwnProperty.call(req.query, key)) {
    const value = req.query[key];
    return Array.isArray(value) ? value[0] : value;
  }

  try {
    return new URL(req.url || '', 'http://localhost').searchParams.get(key);
  } catch {
    return null;
  }
}

function bodyBytes(req) {
  const header = Number(req.headers && req.headers['content-length']);
  let size = Number.isFinite(header) && header > 0 ? header : 0;

  if (req.body !== undefined && req.body !== null) {
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      size = Math.max(size, Buffer.byteLength(raw));
    } catch {
      // Se não der para medir, a validação de estrutura ainda protege.
    }
  }

  return size;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const current = await requireSession(req, res);
    if (!current) return;

    const wantsBackup = queryParam(req, 'backup') === '1';

    try {
      if (wantsBackup) {
        if (current.session.role !== 'admin') {
          return sendJson(res, 403, {
            error: 'forbidden',
            valid: true,
            role: current.session.role
          });
        }

        const backup = await getSharedBackup();
        return sendJson(res, 200, { backup, serverTime: Date.now() });
      }

      const result = await getSharedData();
      return sendJson(res, 200, {
        ...result,
        role: current.session.role,
        serverTime: Date.now()
      });
    } catch (error) {
      console.error('[api/data] falha na leitura:', error.message);
      return sendJson(res, 500, { error: 'storage_error' });
    }
  }

  if (req.method === 'PUT') {
    if (!assertSameOrigin(req, res)) return;

    const current = await requireAdmin(req, res);
    if (!current) return;

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return sendJson(res, 415, { error: 'unsupported_media_type' });
    }

    const size = bodyBytes(req);
    if (size > MAX_PAYLOAD_BYTES) {
      return sendJson(res, 413, {
        error: 'payload_too_large',
        maxBytes: MAX_PAYLOAD_BYTES
      });
    }

    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_json' });
    }

    const hasWrapper = Object.prototype.hasOwnProperty.call(body, 'data');
    const data = hasWrapper ? body.data : body;
    const expectedVersion = hasWrapper ? body.expectedVersion : undefined;

    try {
      const saved = await saveSharedData(data, current.session, expectedVersion);
      return sendJson(res, 200, {
        ...saved,
        role: current.session.role,
        serverTime: Date.now()
      });
    } catch (error) {
      if (error instanceof DataConflictError) {
        return sendJson(res, 409, {
          error: 'conflict',
          current: error.current,
          serverTime: Date.now()
        });
      }

      if (error instanceof PayloadTooLargeError) {
        return sendJson(res, 413, {
          error: error.code,
          maxBytes: MAX_PAYLOAD_BYTES
        });
      }

      if (error instanceof DataValidationError) {
        return sendJson(res, 400, { error: error.code });
      }

      console.error('[api/data] falha ao salvar:', error.message);
      return sendJson(res, 500, { error: 'storage_error' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return sendJson(res, 405, { error: 'method_not_allowed' });
}
