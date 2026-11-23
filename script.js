import { createSessionWatcher, requireSession } from './auth.js';
import { resolveData } from './defaults.js';

// Se o navegador restaurar a página do cache (botão voltar), valida de novo.
window.addEventListener('pageshow', function (event) {
  if (event.persisted) window.location.reload();
});

var carousel = document.querySelector('.carousel');
var track = document.getElementById('carouselTrack');
var ticketsEmpty = document.getElementById('ticketsEmpty');
var infoModal = document.getElementById('infoModal');
var modalBody = document.getElementById('modalBody');

var qrImages = [
  'assets/qr1.png',
  'assets/qr2.png',
  'assets/qr3.png',
  'assets/qr4.png',
  'assets/qr5.png'
];

var qrIndex = 0;
var currentIndex = 0;
var storedData = null;
var renderedTickets = [];

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char];
  });
}

function totalTickets() {
  return track.querySelectorAll('.ticket-wrapper').length;
}

// ---------- Cabeçalho ----------

function renderEvento(evento) {
  if (!evento) return;

  var nomeEl = document.getElementById('ingEventoNome');
  var infoEl = document.getElementById('ingEventoInfo');

  if (evento.nome) nomeEl.textContent = evento.nome;

  var info = [];
  if (evento.data) info.push(evento.data);
  if (evento.local) info.push(evento.local);
  if (info.length) infoEl.textContent = info.join(' - ');
}

// ---------- Ingressos ----------

function ticketHtml(ing, index) {
  return (
    '<div class="ticketmaster-img"><img src="assets/ticketmaster.png" alt="Ticketmaster"></div>' +
    '<div class="progress-container"><div class="progress-bar"></div></div>' +
    '<div class="ticket-card top-card">' +
      '<div class="ticket-top">' +
        '<div class="qr-area"><img src="' + qrImages[0] + '" class="qr-img" alt="QR Code do ingresso"></div>' +
        '<div class="ticket-side">' +
          '<div class="side-block"><span class="mini-label">SETOR</span><span class="sector-name">' + escapeHtml(ing.setor) + '</span></div>' +
          '<div class="side-block acesso"><span class="mini-label">ACESSO</span><span class="sector-name acesso-value">' + escapeHtml(ing.acesso) + '</span></div>' +
          '<button class="more-info-btn" type="button" data-index="' + index + '">Mais informação</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ticket-card info-card">' +
      '<div class="info-full"><span class="mini-label">TITULAR</span><span class="info-value">' + escapeHtml(ing.titular) + '</span></div>' +
      '<div class="info-full"><span class="mini-label">TAXA</span><span class="info-value">' + escapeHtml(ing.taxa) + '</span></div>' +
      '<div class="info-row">' +
        '<div><span class="mini-label">SEÇÃO</span><span class="info-value">' + escapeHtml(ing.secao) + '</span></div>' +
        '<div><span class="mini-label">FILEIRA</span><span class="info-value">' + escapeHtml(ing.fileira) + '</span></div>' +
      '</div>' +
      '<div class="info-row">' +
        '<div><span class="mini-label">ABERTURA</span><span class="info-value">' + escapeHtml(ing.abertura) + '</span></div>' +
        '<div><span class="mini-label">INICIO</span><span class="info-value">' + escapeHtml(ing.inicio) + '</span></div>' +
      '</div>' +
    '</div>'
  );
}

function renderizarIngressos(ingressos) {
  track.innerHTML = '';
  currentIndex = 0;
  moveCarousel();

  ingressos.forEach(function (ing, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'ticket-wrapper';
    wrapper.dataset.index = String(index);
    wrapper.innerHTML = ticketHtml(ing, index);
    track.appendChild(wrapper);
  });

  var empty = ingressos.length === 0;
  track.parentElement.hidden = empty;
  ticketsEmpty.hidden = !empty;

  if (!empty) moveCarousel();
}

// ---------- Modal ----------

function addModalRow(parent, label, value) {
  var item = document.createElement('div');
  item.className = 'modal-item';

  var labelEl = document.createElement('span');
  labelEl.className = 'mini-label';
  labelEl.textContent = label;

  var valueEl = document.createElement('span');
  valueEl.className = 'modal-value';
  valueEl.textContent = value || '—';

  item.appendChild(labelEl);
  item.appendChild(valueEl);
  parent.appendChild(item);
}

function openModal(index) {
  var ing = renderedTickets[index];
  if (!ing) return;

  var evento = (storedData && storedData.evento) || {};

  modalBody.innerHTML = '';

  var groupEvent = document.createElement('div');
  groupEvent.className = 'modal-group';
  var eventTitle = document.createElement('h3');
  eventTitle.className = 'modal-group-title';
  eventTitle.textContent = 'Evento';
  groupEvent.appendChild(eventTitle);
  addModalRow(groupEvent, 'EVENTO', evento.nome);
  addModalRow(groupEvent, 'LOCAL', evento.local);
  addModalRow(groupEvent, 'DATA', evento.data);
  addModalRow(groupEvent, 'HORÁRIO', evento.horario);
  modalBody.appendChild(groupEvent);

  var groupTicket = document.createElement('div');
  groupTicket.className = 'modal-group';
  var ticketTitle = document.createElement('h3');
  ticketTitle.className = 'modal-group-title';
  ticketTitle.textContent = 'Ingresso ' + (index + 1);
  groupTicket.appendChild(ticketTitle);
  addModalRow(groupTicket, 'TITULAR', ing.titular);
  addModalRow(groupTicket, 'SETOR', ing.setor);
  addModalRow(groupTicket, 'ACESSO', ing.acesso);
  addModalRow(groupTicket, 'SEÇÃO', ing.secao);
  addModalRow(groupTicket, 'FILEIRA', ing.fileira);
  addModalRow(groupTicket, 'ABERTURA', ing.abertura);
  addModalRow(groupTicket, 'INÍCIO', ing.inicio);
  addModalRow(groupTicket, 'TAXA', ing.taxa);
  modalBody.appendChild(groupTicket);

  infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal() {
  infoModal.hidden = true;
  document.body.classList.remove('modal-open');
}

// ---------- QR rotativo ----------

function updateQR() {
  qrIndex = (qrIndex + 1) % qrImages.length;

  document.querySelectorAll('.qr-img').forEach(function (img) {
    img.src = qrImages[qrIndex];
  });

  document.querySelectorAll('.progress-bar').forEach(function (bar) {
    bar.style.animation = 'none';
    void bar.getBoundingClientRect();
    requestAnimationFrame(function () {
      bar.style.animation = '';
    });
  });
}

// ---------- Carrossel ----------

// Largura real de um slide. Medir o slide evita erro quando o conteúdo
// muda de tamanho (fonte, orientação, texto maior do sistema).
function slideWidth() {
  var first = track.querySelector('.ticket-wrapper');
  if (first) {
    var width = first.getBoundingClientRect().width;
    if (width > 0) return width;
  }
  return carousel.clientWidth || carousel.offsetWidth || 0;
}

function moveCarousel() {
  var total = totalTickets();
  if (total === 0) return;

  currentIndex = Math.max(0, Math.min(currentIndex, total - 1));
  var width = slideWidth();
  track.style.transform = 'translate3d(' + (-currentIndex * width) + 'px, 0, 0)';
}

var pointerStartX = 0;
var pointerStartY = 0;
var isPointerDown = false;
var isHorizontal = null;
var suppressClick = false;

function bindCarousel() {
  track.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    isPointerDown = true;
    isHorizontal = null;

    try {
      track.setPointerCapture(e.pointerId);
    } catch (err) {}
  }, { passive: true });

  track.addEventListener('pointermove', function (e) {
    if (!isPointerDown) return;

    var diffX = e.clientX - pointerStartX;
    var diffY = e.clientY - pointerStartY;

    if (isHorizontal === null) {
      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        isHorizontal = Math.abs(diffX) >= Math.abs(diffY);
      }
    }

    if (isHorizontal === true) e.preventDefault();
  }, { passive: false });

  track.addEventListener('pointerup', function (e) {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      track.releasePointerCapture(e.pointerId);
    } catch (err) {}

    var diffX = e.clientX - pointerStartX;
    var total = totalTickets();

    if (isHorizontal === true && Math.abs(diffX) > 40) {
      // Um swipe não deve abrir o modal do botão que estava sob o dedo.
      suppressClick = true;
      window.setTimeout(function () { suppressClick = false; }, 350);

      if (diffX < 0) {
        currentIndex = Math.min(currentIndex + 1, total - 1);
      } else {
        currentIndex = Math.max(currentIndex - 1, 0);
      }
      moveCarousel();
    }

    isHorizontal = null;
  }, { passive: true });

  track.addEventListener('pointercancel', function (e) {
    isPointerDown = false;
    isHorizontal = null;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch (err) {}
  });

  window.addEventListener('resize', moveCarousel);
  window.addEventListener('orientationchange', function () {
    window.setTimeout(moveCarousel, 250);
  });
  window.addEventListener('load', moveCarousel);

  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { moveCarousel(); }).observe(carousel);
  }
}

// ---------- Init ----------

async function boot() {
  let session;

  try {
    session = await requireSession();
  } catch (error) {
    return; // requireSession já redirecionou para o login
  }

  document.body.classList.remove('auth-pending');

  createSessionWatcher(session, {
    onExpire: function () {
      window.location.replace('login.html?reason=expired');
    }
  });

  storedData = resolveData().data;

  renderEvento(storedData.evento);
  renderedTickets = storedData.ingressos;
  renderizarIngressos(renderedTickets);

  bindCarousel();
  setInterval(updateQR, 20000);

  track.addEventListener('click', function (e) {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    var button = e.target.closest('.more-info-btn');
    if (!button) return;

    var wrapper = button.closest('.ticket-wrapper');
    var index = wrapper ? Number(wrapper.dataset.index) : 0;
    openModal(index);
  });

  infoModal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close') || e.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !infoModal.hidden) closeModal();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(function () { console.log('SW registrado'); })
      .catch(function (err) { console.log('SW erro:', err); });
  }
}

boot();
