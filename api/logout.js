import { assertSameOrigin, requireMethod, sendJson } from '../server/http.js';
import { clearSessionCookie, destroySession, getSession } from '../server/auth.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!assertSameOrigin(req, res)) return;

  const current = await getSession(req);
  if (current) {
    await destroySession(current.token);
  }

  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}
