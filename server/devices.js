import { store } from './store.js';
import { SESSIONS_SET } from './auth.js';

const BLOCKED_KEY = 'admin:blocked';

function sanitize(session) {
  return {
    id: session.id,
    deviceId: session.deviceId,
    deviceLabel: session.deviceLabel,
    ip: session.ip,
    ua: session.ua,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt
  };
}

export async function listSessions() {
  const hashes = await store.smembers(SESSIONS_SET);
  const sessions = [];

  for (const hash of hashes) {
    const key = 'admin:sess:' + hash;
    const raw = await store.get(key);

    if (!raw) {
      await store.srem(SESSIONS_SET, hash);
      continue;
    }

    try {
      const session = JSON.parse(raw);
      if (Date.now() >= session.expiresAt || Date.now() >= session.absoluteExpiresAt) {
        await store.del(key);
        await store.srem(SESSIONS_SET, hash);
        continue;
      }
      sessions.push(sanitize(session));
    } catch {
      await store.del(key);
      await store.srem(SESSIONS_SET, hash);
    }
  }

  sessions.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  return sessions;
}

async function findSessionHashById(sessionId) {
  const hashes = await store.smembers(SESSIONS_SET);

  for (const hash of hashes) {
    const raw = await store.get('admin:sess:' + hash);
    if (!raw) {
      await store.srem(SESSIONS_SET, hash);
      continue;
    }
    try {
      if (JSON.parse(raw).id === sessionId) return hash;
    } catch {
      await store.del('admin:sess:' + hash);
      await store.srem(SESSIONS_SET, hash);
    }
  }

  return null;
}

export async function revokeSessionById(sessionId) {
  const hash = await findSessionHashById(sessionId);
  if (!hash) return false;
  await store.del('admin:sess:' + hash);
  await store.srem(SESSIONS_SET, hash);
  return true;
}

export async function revokeSessionsByDevice(deviceId) {
  const hashes = await store.smembers(SESSIONS_SET);
  let revoked = 0;

  for (const hash of hashes) {
    const key = 'admin:sess:' + hash;
    const raw = await store.get(key);
    if (!raw) {
      await store.srem(SESSIONS_SET, hash);
      continue;
    }
    try {
      if (JSON.parse(raw).deviceId === deviceId) {
        await store.del(key);
        await store.srem(SESSIONS_SET, hash);
        revoked += 1;
      }
    } catch {
      await store.del(key);
      await store.srem(SESSIONS_SET, hash);
    }
  }

  return revoked;
}

export async function getBlockedDevice(deviceId) {
  const raw = await store.hget(BLOCKED_KEY, deviceId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { blockedAt: null };
  }
}

export async function blockDevice(deviceId, meta = {}) {
  const entry = {
    blockedAt: Date.now(),
    reason: meta.reason || '',
    lastIp: meta.ip || '',
    lastUa: String(meta.ua || '').slice(0, 400)
  };

  await store.hset(BLOCKED_KEY, deviceId, JSON.stringify(entry));
  const revoked = await revokeSessionsByDevice(deviceId);

  return { entry, revoked };
}

export async function unblockDevice(deviceId) {
  const removed = await store.hdel(BLOCKED_KEY, deviceId);
  return removed > 0;
}

export async function listBlockedDevices() {
  const all = await store.hgetall(BLOCKED_KEY);
  return Object.entries(all).map(([deviceId, raw]) => {
    let meta = {};
    try {
      meta = JSON.parse(raw);
    } catch {
      meta = {};
    }
    return { deviceId, ...meta };
  });
}
