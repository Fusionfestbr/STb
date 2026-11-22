export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (typeof req.headers['x-real-ip'] === 'string') return req.headers['x-real-ip'];
  return (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

export function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // navegação/curl; cookie já é SameSite
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;

  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch {
      out[key] = rawValue;
    }
  });

  return out;
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    sendJson(res, 405, { error: 'method_not_allowed' });
    return false;
  }
  return true;
}

export function assertSameOrigin(req, res) {
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: 'invalid_origin' });
    return false;
  }
  return true;
}
