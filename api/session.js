import { requireMethod, sendJson } from '../server/http.js';
import { getSession, SESSION_TTL_MS } from '../server/auth.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const current = await getSession(req);
  if (!current) {
    return sendJson(res, 401, { valid: false });
  }

  return sendJson(res, 200, {
    valid: true,
    role: current.session.role,
    device: {
      deviceId: current.session.deviceId,
      deviceLabel: current.session.deviceLabel,
      ip: current.session.ip
    },
    createdAt: current.session.createdAt,
    lastSeenAt: current.session.lastSeenAt,
    expiresAt: current.session.expiresAt,
    absoluteExpiresAt: current.session.absoluteExpiresAt,
    slidingWindowMs: SESSION_TTL_MS,
    serverTime: Date.now()
  });
}
