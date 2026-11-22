import { requireMethod, sendJson } from '../../server/http.js';
import { requireSession } from '../../server/auth.js';
import { listBlockedDevices, listSessions } from '../../server/devices.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const current = await requireSession(req, res);
  if (!current) return;

  const sessions = await listSessions();
  const blocked = await listBlockedDevices();

  return sendJson(res, 200, {
    active: sessions.map((session) => ({
      ...session,
      isCurrent: session.id === current.session.id
    })),
    blocked,
    serverTime: Date.now()
  });
}
