import {
  assertSameOrigin,
  getIp,
  readJson,
  requireMethod,
  sendJson
} from '../server/http.js';
import { assertStoreReady } from '../server/store.js';
import { createSession, setSessionCookie, verifyPassword } from '../server/auth.js';
import { loginRateLimit } from '../server/rate-limit.js';
import { getBlockedDevice } from '../server/devices.js';

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    assertStoreReady();
  } catch (error) {
    console.error('[login]', error.message);
    return sendJson(res, 500, { error: 'server_not_configured' });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object') {
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
  const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel.slice(0, 80) : 'Dispositivo';

  if (!password || !DEVICE_ID_RE.test(deviceId)) {
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  const ip = getIp(req);
  const ua = req.headers['user-agent'] || '';

  const rate = await loginRateLimit(ip);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return sendJson(res, 429, { error: 'too_many_attempts' });
  }

  const blocked = await getBlockedDevice(deviceId);
  if (blocked) {
    return sendJson(res, 403, { error: 'device_blocked' });
  }

  const storedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!storedHash) {
    console.error('[login] ADMIN_PASSWORD_HASH não configurado.');
    return sendJson(res, 500, { error: 'server_not_configured' });
  }

  if (!verifyPassword(password, storedHash)) {
    return sendJson(res, 401, { error: 'invalid_credentials' });
  }

  const { token, session } = await createSession({ deviceId, deviceLabel, ip, ua });
  setSessionCookie(res, token);

  return sendJson(res, 200, {
    ok: true,
    device: {
      deviceId: session.deviceId,
      deviceLabel: session.deviceLabel
    },
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    serverTime: Date.now()
  });
}
