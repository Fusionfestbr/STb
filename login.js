import {
  ApiError,
  ADMIN_PAGE,
  api,
  detectDeviceLabel,
  fetchSession,
  getDeviceId
} from './auth.js';

const form = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const btnLogin = document.getElementById('btnLogin');
const errorBox = document.getElementById('loginError');
const deviceLabelEl = document.getElementById('deviceLabel');

const deviceLabel = detectDeviceLabel();
deviceLabelEl.textContent = `Este dispositivo: ${deviceLabel}`;

function nextPage() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  if (next && /^[A-Za-z0-9._-]+\.html$/.test(next)) return next;
  return ADMIN_PAGE;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function showReasonFromQuery() {
  const reason = new URLSearchParams(window.location.search).get('reason');
  if (reason === 'expired') showError('Sua sessão expirou. Entre novamente.');
  else if (reason === 'network') showError('Não foi possível conectar ao servidor. Tente novamente.');
  else if (reason === 'error') showError('Não foi possível validar sua sessão. Entre novamente.');
}

function messageForError(error) {
  if (!(error instanceof ApiError)) return 'Algo deu errado. Tente novamente.';

  switch (error.code) {
    case 'invalid_credentials':
      return 'Senha incorreta. Verifique e tente novamente.';
    case 'device_blocked':
      return 'Este dispositivo foi bloqueado. Fale com o administrador.';
    case 'too_many_attempts':
      return 'Muitas tentativas. Aguarde 15 minutos antes de tentar de novo.';
    case 'server_not_configured':
      return 'O servidor ainda não está configurado (senha/Redis).';
    case 'network_error':
      return 'Sem conexão com o servidor. Verifique sua internet.';
    default:
      return 'Não foi possível entrar. Tente novamente.';
  }
}

function setLoading(loading) {
  btnLogin.disabled = loading;
  btnLogin.classList.toggle('loading', loading);
}

togglePassword.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  togglePassword.querySelector('.material-symbols-outlined').textContent = showing ? 'visibility' : 'visibility_off';
  togglePassword.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const password = passwordInput.value;
  if (!password) {
    showError('Digite a senha para continuar.');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    await api('/api/login', {
      method: 'POST',
      body: {
        password,
        deviceId: getDeviceId(),
        deviceLabel
      }
    });

    window.location.replace(nextPage());
  } catch (error) {
    showError(messageForError(error));
    setLoading(false);
    passwordInput.select();
  }
});

// Se já houver sessão válida, vai direto para o painel.
(async () => {
  showReasonFromQuery();
  try {
    const session = await fetchSession();
    if (session) window.location.replace(nextPage());
  } catch (e) {}
})();
