import { assertSameOrigin, readJson, requireMethod, sendJson } from '../../server/http.js';
import { requireAdmin } from '../../server/auth.js';
import { blockDevice } from '../../server/devices.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  if (!assertSameOrigin(req, res)) return;

  const current = await requireAdmin(req, res);
  if (!current) return;

  const body = await readJson(req);
  const deviceId = body && typeof body.deviceId === 'string' ? body.deviceId : '';
  const reason = body && typeof body.reason === 'string' ? body.reason.slice(0, 200) : '';

  if (!deviceId) {
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  if (deviceId === current.session.deviceId) {
    return sendJson(res, 400, { error: 'cannot_block_current_device' });
  }

  const { revoked } = await blockDevice(deviceId, {
    reason,
    ip: current.session.ip,
    ua: current.session.ua
  });

  return sendJson(res, 200, { ok: true, revoked });
}
