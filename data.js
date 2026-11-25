// Cliente dos dados compartilhados.
// O servidor é a fonte da verdade; o localStorage funciona como cache
// e como backup do que já existia naquele aparelho.

import { api } from './auth.js';
import {
  DEFAULT_DATA,
  cloneData,
  readSavedData,
  resolveData,
  cacheData
} from './defaults.js';

export const MAX_CLIENT_PAYLOAD = 500 * 1024;

function hasTickets(value) {
  return Boolean(value) && Array.isArray(value.ingressos) && value.ingressos.length > 0;
}

function validResponse(response) {
  if (!response || !response.data || !Array.isArray(response.data.ingressos)) {
    throw new Error('invalid_response');
  }
  return response;
}

function safeCache(data) {
  try {
    return cacheData(data);
  } catch (error) {
    return { changed: false, backedUp: false, error };
  }
}

export async function fetchSharedData() {
  return validResponse(await api('/api/data'));
}

export async function fetchSharedBackup() {
  return api('/api/data?backup=1');
}

export async function publishSharedData(data, expectedVersion) {
  const body = { data };

  if (expectedVersion !== undefined && expectedVersion !== null) {
    body.expectedVersion = expectedVersion;
  }

  if (JSON.stringify(body).length > MAX_CLIENT_PAYLOAD) {
    const error = new Error('payload_too_large');
    error.status = 413;
    error.code = 'payload_too_large';
    throw error;
  }

  const result = validResponse(await api('/api/data', { method: 'PUT', body }));
  safeCache(result.data);
  return result;
}

function localResult(error) {
  const local = resolveData();

  return {
    data: local.data,
    isFallback: local.isFallback,
    version: 0,
    updatedAt: null,
    updatedBy: null,
    source: local.isFallback ? 'default' : 'cache',
    error: error || null
  };
}

export async function loadData(options = {}) {
  const migrateLocal = Boolean(options.migrateLocal);
  let remote;

  try {
    remote = await fetchSharedData();
  } catch (error) {
    return localResult(error);
  }

  // Servidor ainda sem publicação.
  if (remote.version === 0) {
    const saved = readSavedData();

    // Migração única: o admin publica o que já existia neste aparelho.
    if (migrateLocal && hasTickets(saved)) {
      try {
        const published = await publishSharedData(saved, 0);
        const cached = safeCache(published.data);

        return {
          data: published.data,
          isFallback: false,
          version: published.version,
          updatedAt: published.updatedAt || null,
          updatedBy: published.updatedBy || null,
          source: 'migrated',
          localBackedUp: cached.backedUp,
          cacheError: cached.error || null
        };
      } catch (error) {
        // Outra aba/dispositivo publicou ao mesmo tempo: usa a versão atual.
        if (error.status === 409) {
          const current = error.payload && error.payload.current;

          if (current && current.data) {
            const cached = safeCache(current.data);
            return {
              data: current.data,
              isFallback: false,
              version: current.version || 0,
              updatedAt: current.updatedAt || null,
              updatedBy: current.updatedBy || null,
              source: 'remote',
              conflict: true,
              localBackedUp: cached.backedUp,
              cacheError: cached.error || null
            };
          }

          try {
            const latest = await fetchSharedData();
            const cached = safeCache(latest.data);
            return {
              data: latest.data,
              isFallback: false,
              version: latest.version,
              updatedAt: latest.updatedAt || null,
              updatedBy: latest.updatedBy || null,
              source: 'remote',
              conflict: true,
              localBackedUp: cached.backedUp,
              cacheError: cached.error || null
            };
          } catch (retryError) {
            // Sem conexão para reler: cai no fallback local abaixo.
          }
        }

        const local = localResult(error);
        local.migrationError = true;
        return local;
      }
    }

    // Ainda não publicado: mantém a cópia local (se existir) para não
    // regredir o que o admin já via neste aparelho.
    if (hasTickets(saved)) {
      const local = resolveData();
      return {
        data: local.data,
        isFallback: false,
        version: 0,
        updatedAt: null,
        updatedBy: null,
        source: 'cache'
      };
    }

    return {
      data: cloneData(DEFAULT_DATA),
      isFallback: true,
      version: 0,
      updatedAt: null,
      updatedBy: null,
      source: 'default'
    };
  }

  const cached = safeCache(remote.data);

  return {
    data: remote.data,
    isFallback: false,
    version: remote.version,
    updatedAt: remote.updatedAt || null,
    updatedBy: remote.updatedBy || null,
    source: 'remote',
    localBackedUp: cached.backedUp,
    cacheError: cached.error || null
  };
}
