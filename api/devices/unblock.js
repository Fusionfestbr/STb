import { assertSameOrigin, readJson, requireMethod, sendJson } from '../../server/http.js';
import { requireAdmin } from '../../server/auth.js';
import { unblockDevice } from '../../server/devices.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!assertSameOrigin(req, res)) return;

  const current = await requireAdmin(req, res);
  if (!current) return;

  const body = await readJson(req);
  const deviceId = body && typeof body.deviceId === 'string' ? body.deviceId : '';

  if (!deviceId) {
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  const removed = await unblockDevice(deviceId);
  if (!removed) {
    return sendJson(res, 404, { error: 'device_not_blocked' });
  }

  return sendJson(res, 200, { ok: true });
}
