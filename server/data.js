// Fonte única dos dados compartilhados (evento + ingressos).
// O servidor é a autoridade: o cliente não consegue "salvar só localmente"
// quando está logado. Antes de sobrescrever, a versão anterior vai para
// `app:data:backup`.

import { store } from './store.js';
import {
  DEFAULT_DATA,
  FIXED_TICKETS,
  cloneData,
  mergeFixedTickets
} from '../defaults.js';

export const DATA_KEY = 'app:data';
export const BACKUP_KEY = 'app:data:backup';
export const MAX_PAYLOAD_BYTES = 512 * 1024;

const MAX_TICKETS = 50;
const MAX_THUMB_CHARS = 300 * 1024;

const EVENT_LIMITS = {
  nome: 160,
  data: 32,
  horario: 32,
  local: 180,
  thumb: MAX_THUMB_CHARS
};

const TICKET_LIMITS = {
  setor: 120,
  acesso: 120,
  titular: 180,
  taxa: 120,
  secao: 120,
  fileira: 120,
  abertura: 32,
  inicio: 32
};

const TICKET_FIELDS = Object.keys(TICKET_LIMITS);
const FIXED_IDS = new Set(FIXED_TICKETS.map((ticket) => ticket.fixedId));

const DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
const ASSET_RE = /^assets\/[A-Za-z0-9._-]+$/;

export class DataValidationError extends Error {
  constructor(code) {
    super(code || 'invalid_data');
    this.name = 'DataValidationError';
    this.code = code || 'invalid_data';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(code) {
    super(code || 'payload_too_large');
    this.name = 'PayloadTooLargeError';
    this.code = code || 'payload_too_large';
  }
}

export class DataConflictError extends Error {
  constructor(current) {
    super('conflict');
    this.name = 'DataConflictError';
    this.code = 'conflict';
    this.current = current || null;
  }
}

function text(value, maxLength) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeThumb(value, strict) {
  const raw = String(value == null ? '' : value).trim();

  if (!raw) return DEFAULT_DATA.evento.thumb;

  if (raw.startsWith('data:image/')) {
    if (raw.length > EVENT_LIMITS.thumb) {
      if (strict) throw new PayloadTooLargeError('thumb_too_large');
      return DEFAULT_DATA.evento.thumb;
    }
    return DATA_IMAGE_RE.test(raw) ? raw : DEFAULT_DATA.evento.thumb;
  }

  return ASSET_RE.test(raw) ? raw : DEFAULT_DATA.evento.thumb;
}

function normalizeEvent(value, strict) {
  if (value == null) value = {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    if (strict) throw new DataValidationError('invalid_event');
    value = {};
  }

  return {
    nome: text(value.nome, EVENT_LIMITS.nome) || DEFAULT_DATA.evento.nome,
    data: text(value.data, EVENT_LIMITS.data) || DEFAULT_DATA.evento.data,
    horario: text(value.horario, EVENT_LIMITS.horario) || DEFAULT_DATA.evento.horario,
    local: text(value.local, EVENT_LIMITS.local) || DEFAULT_DATA.evento.local,
    thumb: normalizeThumb(value.thumb, strict)
  };
}

function normalizeTicket(value, strict) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (strict) throw new DataValidationError('invalid_ticket');
    return null;
  }

  const ticket = {};

  // Só aceita IDs fixos conhecidos. Um fixedId inventado não pode
  // transformar um ingresso comum em "protegido".
  if (typeof value.fixedId === 'string' && FIXED_IDS.has(value.fixedId)) {
    ticket.fixedId = value.fixedId;
  }

  TICKET_FIELDS.forEach((field) => {
    ticket[field] = text(value[field], TICKET_LIMITS[field]);
  });

  return ticket;
}

// Valida e normaliza. Em modo strict, dados inválidos geram erro (PUT).
// Fora do modo strict, o que der para recuperar é mantido (leitura).
export function normalizeData(input, options = {}) {
  const strict = Boolean(options.strict);

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (strict) throw new DataValidationError('invalid_data');
    return cloneData(DEFAULT_DATA);
  }

  if (!Array.isArray(input.ingressos)) {
    if (strict) throw new DataValidationError('invalid_tickets');
    return cloneData(DEFAULT_DATA);
  }

  if (input.ingressos.length > MAX_TICKETS) {
    if (strict) throw new PayloadTooLargeError('too_many_tickets');
  }

  const evento = normalizeEvent(input.evento, strict);
  const tickets = [];

  input.ingressos.slice(0, MAX_TICKETS).forEach((item) => {
    const ticket = normalizeTicket(item, strict);
    if (ticket) tickets.push(ticket);
  });

  const merged = mergeFixedTickets(tickets);
  const fixedCount = FIXED_TICKETS.length;

  // Extras nunca carregam fixedId: isso evita que uma cópia duplicada
  // de um ingresso fixo fique protegida contra remoção.
  const ingressos = merged.slice(0, fixedCount).concat(
    merged.slice(fixedCount).map((ticket) => {
      const copy = { ...ticket };
      delete copy.fixedId;
      return copy;
    })
  );

  return { evento, ingressos };
}

function sessionMeta(session) {
  if (!session || typeof session !== 'object') return null;
  return {
    role: session.role === 'guest' || session.role === 'generic' ? session.role : 'admin',
    deviceId: text(session.deviceId, 80),
    deviceLabel: text(session.deviceLabel, 80)
  };
}

function defaultResult() {
  return {
    data: cloneData(DEFAULT_DATA),
    version: 0,
    updatedAt: null,
    updatedBy: null,
    source: 'default'
  };
}

function parseEnvelope(raw) {
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  // Aceita tanto o envelope novo ({version,data}) quanto dados "crus",
  // caso alguma versão anterior tenha gravado direto no Redis.
  const hasEnvelope = parsed.data && typeof parsed.data === 'object';
  const payload = hasEnvelope ? parsed.data : parsed;
  const data = normalizeData(payload, { strict: false });

  if (!hasEnvelope && (!parsed.evento && !Array.isArray(parsed.ingressos))) {
    return null;
  }

  const version = Number(parsed.version);

  return {
    version: Number.isInteger(version) && version > 0 ? version : 1,
    updatedAt: Number.isFinite(Number(parsed.updatedAt)) ? Number(parsed.updatedAt) : null,
    updatedBy: hasEnvelope && parsed.updatedBy && typeof parsed.updatedBy === 'object'
      ? {
        role: parsed.updatedBy.role === 'guest' || parsed.updatedBy.role === 'generic'
          ? parsed.updatedBy.role
          : 'admin',
        deviceId: text(parsed.updatedBy.deviceId, 80),
        deviceLabel: text(parsed.updatedBy.deviceLabel, 80)
      }
      : null,
    data
  };
}

export async function getSharedData() {
  const raw = await store.get(DATA_KEY);

  if (!raw) return defaultResult();

  const envelope = parseEnvelope(raw);

  if (!envelope) {
    return {
      ...defaultResult(),
      corrupted: true
    };
  }

  return {
    data: envelope.data,
    version: envelope.version,
    updatedAt: envelope.updatedAt,
    updatedBy: envelope.updatedBy,
    source: 'remote'
  };
}

export async function getSharedBackup() {
  const raw = await store.get(BACKUP_KEY);
  return parseEnvelope(raw);
}

export async function saveSharedData(input, session, expectedVersion) {
  const data = normalizeData(input, { strict: true });
  const raw = await store.get(DATA_KEY);
  const current = parseEnvelope(raw);
  const currentVersion = current ? current.version : 0;

  if (expectedVersion !== undefined && expectedVersion !== null) {
    const expected = Number(expectedVersion);

    if (!Number.isInteger(expected) || expected < 0) {
      throw new DataValidationError('invalid_version');
    }

    if (expected !== currentVersion) {
      throw new DataConflictError(current || defaultResult());
    }
  }

  // Regra de ouro: nunca sobrescreve sem guardar a versão anterior.
  if (raw) {
    try {
      await store.set(BACKUP_KEY, raw);
    } catch (error) {
      console.error('[data] falha ao gravar backup:', error.message);
      throw new Error('backup_failed');
    }
  }

  const envelope = {
    version: currentVersion + 1,
    updatedAt: Date.now(),
    updatedBy: sessionMeta(session),
    data
  };

  await store.set(DATA_KEY, JSON.stringify(envelope));

  return {
    ...envelope,
    source: 'remote'
  };
}
