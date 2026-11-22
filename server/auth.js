import crypto from 'node:crypto';
import { store } from './store.js';
import { parseCookies } from './http.js';

export const COOKIE_NAME = 'admin_session';
export const SESSION_TTL_MS = 30 * 60 * 1000;        // 30 minutos (deslizante)
const MAX_HOURS = Math.max(1, Number(process.env.SESSION_MAX_HOURS) || 12);
export const SESSION_MAX_MS = MAX_HOURS * 60 * 60 * 1000; // teto absoluto
const REFRESH_THROTTLE_MS = 60 * 1000;               // grava no máximo 1x por minuto

const SESSION_PREFIX = 'admin:sess:';
export const SESSIONS_SET = 'admin:sessions';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function b64(buffer) {
  return buffer.toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// ---------- Senha ----------

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64(salt)}$${b64(hash)}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string' || password.length === 0) return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---------- Sessão ----------

function sessionKey(token) {
  return SESSION_PREFIX + sha256(token);
}

export async function createSession({ deviceId, deviceLabel, ip, ua, role = 'admin' }) {
  const token = b64(crypto.randomBytes(32));
  const key = sessionKey(token);
  const now = Date.now();
  const absoluteExpiresAt = now + SESSION_MAX_MS;
  const expiresAt = Math.min(now + SESSION_TTL_MS, absoluteExpiresAt);

  const session = {
    id: crypto.randomUUID(),
    deviceId,
    deviceLabel,
    role: role === 'guest' ? 'guest' : 'admin',
    ip,
    ua: String(ua || '').slice(0, 400),
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    absoluteExpiresAt
  };

  await store.set(key, JSON.stringify(session), Math.ceil((expiresAt - now) / 1000));
  await store.sadd(SESSIONS_SET, sha256(token));

  return { token, session };
}

export async function destroySession(token) {
  if (!token) return;
  await store.del(sessionKey(token));
  await store.srem(SESSIONS_SET, sha256(token));
}

async function refreshSession(key, session) {
  const now = Date.now();
  if (now - session.lastSeenAt < REFRESH_THROTTLE_MS) return session;

  const expiresAt = Math.min(now + SESSION_TTL_MS, session.absoluteExpiresAt);
  session.lastSeenAt = now;
  session.expiresAt = expiresAt;

  const ttl = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  await store.set(key, JSON.stringify(session), ttl);
  return session;
}

export async function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;

  const key = sessionKey(token);
  const raw = await store.get(key);
  if (!raw) return null;

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    await destroySession(token);
    return null;
  }

  // Sessões criadas antes da separação de papéis são tratadas como admin.
  if (session.role !== 'guest' && session.role !== 'admin') {
    session.role = 'admin';
  }

  const now = Date.now();
  if (now >= session.expiresAt || now >= session.absoluteExpiresAt) {
    await destroySession(token);
    return null;
  }

  await refreshSession(key, session);
  return { token, session };
}

export function setSessionCookie(res, token) {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

export async function requireSession(req, res) {
  const result = await getSession(req);
  if (!result) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ error: 'unauthorized', valid: false }));
    return null;
  }
  return result;
}

// Exige uma sessão de administrador. Convidados recebem 403.
export async function requireAdmin(req, res) {
  const result = await requireSession(req, res);
  if (!result) return null;

  if (result.session.role !== 'admin') {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.end(JSON.stringify({ error: 'forbidden', valid: true, role: result.session.role }));
    return null;
  }

  return result;
}
