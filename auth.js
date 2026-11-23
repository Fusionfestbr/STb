// Cliente compartilhado de autenticação (login, sessão, logout e heartbeat).

const DEVICE_KEY = 'mi-device-id';
export const LOGIN_PAGE = 'login.html';
export const ADMIN_PAGE = 'admin.html';

export class ApiError extends Error {
  constructor(status, code) {
    super(code || 'api_error');
    this.status = status;
    this.code = code || 'api_error';
  }
}

export function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVICE_KEY);
  } catch (e) {}

  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = generateId();
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch (e) {}
  }

  return id;
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function detectDeviceLabel() {
  const ua = navigator.userAgent || '';

  let browser = 'Navegador';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

  let os = 'Dispositivo';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return `${browser} em ${os}`;
}

export async function api(path, options = {}) {
  const config = {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  };

  if (options.body !== undefined) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, config);
  } catch (e) {
    throw new ApiError(0, 'network_error');
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {}

  if (!response.ok) {
    throw new ApiError(response.status, data && data.error ? data.error : 'request_failed');
  }

  if (data === null) {
    // Resposta não-JSON normalmente significa que /api não está disponível
    // (ex.: rodando apenas `vite dev` em vez de `vercel dev`).
    throw new ApiError(0, 'network_error');
  }

  return data;
}

export async function fetchSession() {
  try {
    return await api('/api/session');
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

function currentPage() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return /^[A-Za-z0-9._-]+\.html$/.test(file) ? file : 'index.html';
}

export function goToLogin(reason, next) {
  const params = new URLSearchParams();
  const target = next || currentPage();
  params.set('next', target === LOGIN_PAGE ? 'index.html' : target);
  if (reason) params.set('reason', reason);
  window.location.replace(`${LOGIN_PAGE}?${params.toString()}`);
}

export async function requireSession(next) {
  let session = null;
  try {
    session = await fetchSession();
  } catch (error) {
    goToLogin(error.status === 0 ? 'network' : 'error', next);
    throw error;
  }

  if (!session) {
    goToLogin('login', next);
    throw new ApiError(401, 'unauthorized');
  }

  return session;
}

// Páginas de edição exigem admin. Convidados/genéricos só visualizam.
export async function requireAdminSession() {
  const session = await requireSession(ADMIN_PAGE);

  if (session.role !== 'admin') {
    window.location.replace('ingresso.html');
    throw new ApiError(403, 'forbidden');
  }

  return session;
}

export async function refreshSession() {
  return api('/api/session');
}

export async function logout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (e) {}
  window.location.replace(LOGIN_PAGE);
}

export function formatRemaining(ms) {
  if (ms <= 0) return '0min';
  const totalMinutes = Math.ceil(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h${String(minutes).padStart(2, '0')}` : `${hours}h`;
}

// Mantém a sessão viva enquanto houver atividade (sliding de 30 min).
export function createSessionWatcher(session, { onUpdate, onExpire } = {}) {
  let expiresAt = session.expiresAt;
  let lastPing = Date.now();
  let stopped = false;
  let pinging = false;

  const emit = (data) => {
    if (data) expiresAt = data.expiresAt;
    if (onUpdate) onUpdate({ expiresAt, session: data || null });
  };

  async function ping() {
    if (stopped || pinging) return;
    pinging = true;
    try {
      const data = await refreshSession();
      lastPing = Date.now();
      emit(data);
    } catch (error) {
      if (error.status === 401) {
        stopped = true;
        if (onExpire) onExpire('expired');
      }
    } finally {
      pinging = false;
    }
  }

  function markActivity() {
    if (stopped) return;
    if (Date.now() - lastPing < 60 * 1000) return;
    ping();
  }

  const events = ['pointerdown', 'keydown', 'input', 'touchstart'];
  events.forEach((name) => window.addEventListener(name, markActivity, { passive: true }));

  const timer = window.setInterval(() => {
    if (stopped) return;

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      stopped = true;
      if (onExpire) onExpire('expired');
      return;
    }

    emit(null);
    if (remaining < 60 * 1000) ping();
  }, 15000);

  emit(null);

  return {
    ping,
    stop() {
      stopped = true;
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, markActivity));
    }
  };
}
