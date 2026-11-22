import { api } from './auth.js';

const container = document.getElementById('devicesPanel');

function formatDate(ms) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '—';
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(label, className, onClick) {
  const button = el('button', 'device-action ' + className, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function renderEmptyState(message) {
  const empty = el('p', 'devices-empty', message);
  return empty;
}

function renderActive(active, handlers) {
  const list = el('div', 'devices-list');

  active.forEach((session) => {
    const card = el('div', 'device-card');
    if (session.isCurrent) card.classList.add('current');

    const info = el('div', 'device-info');
    const title = el('div', 'device-title');
    title.appendChild(el('span', 'device-name', session.deviceLabel || 'Dispositivo'));
    if (session.isCurrent) title.appendChild(el('span', 'device-badge', 'Este dispositivo'));
    if (session.role === 'guest') title.appendChild(el('span', 'device-badge guest', 'Convidado'));
    else title.appendChild(el('span', 'device-badge admin', 'Admin'));
    info.appendChild(title);
    info.appendChild(el('span', 'device-meta', `IP ${session.ip || '—'} · último acesso ${formatDate(session.lastSeenAt)}`));
    info.appendChild(el('span', 'device-meta', `Sessão criada ${formatDate(session.createdAt)} · expira ${formatDate(session.expiresAt)}`));
    card.appendChild(info);

    const actions = el('div', 'device-actions');
    actions.appendChild(actionButton('Revogar', 'revoke', () => handlers.revoke(session, card)));
    if (!session.isCurrent) {
      actions.appendChild(actionButton('Bloquear', 'block', () => handlers.block(session, card)));
    }
    card.appendChild(actions);

    list.appendChild(card);
  });

  return list;
}

function renderBlocked(blocked, handlers) {
  const section = el('div', 'devices-blocked');
  section.appendChild(el('h3', 'devices-subtitle', 'Dispositivos bloqueados'));

  if (blocked.length === 0) {
    section.appendChild(renderEmptyState('Nenhum dispositivo bloqueado.'));
    return section;
  }

  const list = el('div', 'devices-list');
  blocked.forEach((device) => {
    const card = el('div', 'device-card blocked');

    const info = el('div', 'device-info');
    info.appendChild(el('span', 'device-name', 'Dispositivo bloqueado'));
    info.appendChild(el('span', 'device-meta', `Desde ${formatDate(device.blockedAt)}${device.reason ? ' · ' + device.reason : ''}`));
    card.appendChild(info);

    const actions = el('div', 'device-actions');
    actions.appendChild(actionButton('Desbloquear', 'unblock', () => handlers.unblock(device, card)));
    card.appendChild(actions);

    list.appendChild(card);
  });

  section.appendChild(list);
  return section;
}

async function load() {
  container.innerHTML = '';
  container.appendChild(el('p', 'devices-loading', 'Carregando dispositivos…'));

  try {
    const data = await api('/api/devices');
    render(data);
  } catch (error) {
    container.innerHTML = '';
    const box = el('div', 'devices-error');
    box.appendChild(el('p', '', 'Não foi possível carregar os dispositivos.'));
    box.appendChild(actionButton('Tentar novamente', 'secondary', load));
    container.appendChild(box);
  }
}

function render(data) {
  container.innerHTML = '';

  const handlers = {
    async revoke(session, card) {
      const ok = window.confirm(`Revogar a sessão de "${session.deviceLabel}"?`);
      if (!ok) return;

      try {
        await api('/api/devices/revoke', { method: 'POST', body: { sessionId: session.id } });
        if (session.isCurrent) {
          window.location.replace('login.html?reason=expired');
          return;
        }
        await load();
      } catch (error) {
        window.alert('Não foi possível revogar a sessão.');
      }
    },

    async block(session, card) {
      const ok = window.confirm(`Bloquear "${session.deviceLabel}"? Todas as sessões serão encerradas e o dispositivo não poderá entrar novamente até ser desbloqueado.`);
      if (!ok) return;

      try {
        await api('/api/devices/block', {
          method: 'POST',
          body: { deviceId: session.deviceId, reason: 'bloqueado pelo administrador' }
        });
        await load();
      } catch (error) {
        window.alert('Não foi possível bloquear o dispositivo.');
      }
    },

    async unblock(device, card) {
      try {
        await api('/api/devices/unblock', {
          method: 'POST',
          body: { deviceId: device.deviceId }
        });
        await load();
      } catch (error) {
        window.alert('Não foi possível desbloquear o dispositivo.');
      }
    }
  };

  container.appendChild(el('h3', 'devices-subtitle', `Conectados agora (${data.active.length})`));

  if (data.active.length === 0) {
    container.appendChild(renderEmptyState('Nenhuma sessão ativa.'));
  } else {
    container.appendChild(renderActive(data.active, handlers));
  }

  container.appendChild(renderBlocked(data.blocked || [], handlers));
}

export function initDevices() {
  if (!container) return;
  load();

  const refresh = document.getElementById('btnRefreshDevices');
  if (refresh) refresh.addEventListener('click', load);
}
