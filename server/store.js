// Camada de persistência das sessões.
// Em produção usa Upstash Redis (REST, sem dependência de SDK).
// Em desenvolvimento local, se as variáveis não existirem, usa memória.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REST_URL = process.env.UPSTASH_REDIS_REST_URL
  || process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
  || process.env.KV_REST_API_TOKEN;
const HAS_REDIS = Boolean(REST_URL && REST_TOKEN);
const IS_PRODUCTION = process.env.VERCEL_ENV === 'production';

if (!HAS_REDIS && IS_PRODUCTION) {
  console.error('[store] Redis não configurado (UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_URL/TOKEN).');
}

async function rest(args) {
  const res = await fetch(REST_URL.replace(/\/$/, ''), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  if (!res.ok) {
    throw new Error(`Upstash HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data && data.error) throw new Error(`Upstash: ${data.error}`);
  return data ? data.result : null;
}

// ---------- Fallback local (arquivo) ----------
// No `vercel dev` cada rota é um processo separado, então um Map em memória
// não seria compartilhado entre /api/login e /api/session. Usamos um arquivo
// temporário para simular o Redis durante o desenvolvimento.
const FILE_PATH = process.env.MI_STORE_FILE
  || path.join(os.tmpdir(), 'meus-ingressos-store.json');

function emptyState() {
  return { kv: {}, sets: {}, hashes: {} };
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    return {
      kv: parsed.kv || {},
      sets: parsed.sets || {},
      hashes: parsed.hashes || {}
    };
  } catch (e) {
    return emptyState();
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(state));
  } catch (e) {
    console.error('[store] falha ao gravar estado local:', e.message);
  }
}

function prune(state) {
  const now = Date.now();
  Object.keys(state.kv).forEach((key) => {
    const entry = state.kv[key];
    if (entry && entry.expiresAt && entry.expiresAt <= now) delete state.kv[key];
  });
  return state;
}

const file = {
  async get(key) {
    const entry = readState().kv[key];
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) return null;
    return entry.value;
  },
  async set(key, value, ttlSeconds) {
    const state = prune(readState());
    state.kv[key] = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null
    };
    writeState(state);
  },
  async del(key) {
    const state = readState();
    const existed = Object.prototype.hasOwnProperty.call(state.kv, key);
    delete state.kv[key];
    delete state.sets[key];
    delete state.hashes[key];
    writeState(state);
    return existed ? 1 : 0;
  },
  async sadd(key, member) {
    const state = readState();
    if (!Array.isArray(state.sets[key])) state.sets[key] = [];
    if (!state.sets[key].includes(member)) state.sets[key].push(member);
    writeState(state);
    return 1;
  },
  async srem(key, member) {
    const state = readState();
    const set = state.sets[key] || [];
    const next = set.filter((item) => item !== member);
    const removed = next.length !== set.length;
    if (next.length) state.sets[key] = next;
    else delete state.sets[key];
    writeState(state);
    return removed ? 1 : 0;
  },
  async smembers(key) {
    const state = readState();
    return (state.sets[key] || []).slice();
  },
  async hget(key, field) {
    const hash = readState().hashes[key];
    return hash && hash[field] !== undefined ? hash[field] : null;
  },
  async hset(key, field, value) {
    const state = readState();
    if (!state.hashes[key]) state.hashes[key] = {};
    state.hashes[key][field] = value;
    writeState(state);
    return 1;
  },
  async hdel(key, field) {
    const state = readState();
    const hash = state.hashes[key];
    if (!hash || hash[field] === undefined) return 0;
    delete hash[field];
    if (Object.keys(hash).length === 0) delete state.hashes[key];
    writeState(state);
    return 1;
  },
  async hgetall(key) {
    const hash = readState().hashes[key];
    return hash ? { ...hash } : {};
  },
  async incr(key) {
    const state = prune(readState());
    const entry = state.kv[key];
    const next = (entry ? Number(entry.value) : 0) + 1;
    state.kv[key] = {
      value: String(next),
      expiresAt: entry && entry.expiresAt ? entry.expiresAt : null
    };
    writeState(state);
    return next;
  },
  async expire(key, seconds) {
    const state = readState();
    const entry = state.kv[key];
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    writeState(state);
    return 1;
  }
};

// ---------- Backend Upstash ----------
const upstash = {
  get: (key) => rest(['GET', key]),
  set: async (key, value, ttlSeconds) => {
    if (ttlSeconds) return rest(['SET', key, value, 'EX', ttlSeconds]);
    return rest(['SET', key, value]);
  },
  del: (key) => rest(['DEL', key]),
  sadd: (key, member) => rest(['SADD', key, member]),
  srem: (key, member) => rest(['SREM', key, member]),
  smembers: async (key) => (await rest(['SMEMBERS', key])) || [],
  hget: (key, field) => rest(['HGET', key, field]),
  hset: (key, field, value) => rest(['HSET', key, field, value]),
  hdel: (key, field) => rest(['HDEL', key, field]),
  hgetall: async (key) => {
    const flat = (await rest(['HGETALL', key])) || [];
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  },
  incr: (key) => rest(['INCR', key]),
  expire: (key, seconds) => rest(['EXPIRE', key, seconds])
};

export const store = HAS_REDIS ? upstash : file;

export const storeMode = HAS_REDIS ? 'redis' : 'file';

// Em produção sem Redis as sessões não podem ser compartilhadas entre instâncias.
export function assertStoreReady() {
  if (!HAS_REDIS && IS_PRODUCTION) {
    throw new Error('Redis não configurado (UPSTASH_REDIS_REST_URL/TOKEN ou KV_REST_API_URL/TOKEN).');
  }
}
