import { assertSameOrigin, readJson, requireMethod, sendJson } from '../../server/http.js';
import { requireSession } from '../../server/auth.js';
import { revokeSessionById } from '../../server/devices.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!assertSameOrigin(req, res)) return;

  const current = await requireSession(req, res);
  if (!current) return;

  const body = await readJson(req);
  const sessionId = body && typeof body.sessionId === 'string' ? body.sessionId : '';

  if (!sessionId) {
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  const revoked = await revokeSessionById(sessionId);
  if (!revoked) {
    return sendJson(res, 404, { error: 'session_not_found' });
  }

  return sendJson(res, 200, { ok: true });
}
