import {
  createSessionWatcher,
  formatRemaining,
  logout,
  requireSession
} from './auth.js';
import { initDevices } from './admin-devices.js';
import {
  resolveData,
  saveData,
  restoreDefaults,
  restoreBackup,
  hasBackup
} from './defaults.js';

var CUSTOM_THUMB_VALUE = '__custom';

var ingressosList = document.getElementById('ingressos-list');
var btnAdd = document.getElementById('btnAdd');
var btnSave = document.getElementById('btnSave');
var btnPreview = document.getElementById('btnPreview');
var btnReset = document.getElementById('btnReset');
var btnLogout = document.getElementById('btnLogout');
var toast = document.getElementById('toast');
var eventoNome = document.getElementById('eventoNome');
var eventoData = document.getElementById('eventoData');
var eventoHorario = document.getElementById('eventoHorario');
var eventoLocal = document.getElementById('eventoLocal');
var eventoThumb = document.getElementById('eventoThumb');
var eventoThumbFile = document.getElementById('eventoThumbFile');
var thumbPreview = document.getElementById('thumbPreview');
var uploadHint = document.getElementById('uploadHint');
var sessionTimer = document.getElementById('sessionTimer');
var roleBadge = document.getElementById('roleBadge');
var securityTitle = document.getElementById('securityTitle');
var securityCard = document.getElementById('securityCard');
var dataNotice = document.getElementById('dataNotice');
var btnExport = document.getElementById('btnExport');
var importFile = document.getElementById('importFile');
var btnRestoreBackup = document.getElementById('btnRestoreBackup');

var customThumb = null;

var camposTemplate = [
  { key: 'setor', label: 'SETOR', placeholder: 'Ex: Cadeira Superior' },
  { key: 'acesso', label: 'ACESSO', placeholder: 'Ex: Portão B' },
  { key: 'titular', label: 'TITULAR', placeholder: 'Ex: Camila Souza - 121.714.481-87' },
  { key: 'taxa', label: 'TAXA', placeholder: 'Ex: INTEIRA - R$380,00' },
  { key: 'secao', label: 'SEÇÃO', placeholder: 'Ex: CADEIRA SUPERIOR' },
  { key: 'fileira', label: 'FILEIRA', placeholder: 'Ex: Não numerado' },
  { key: 'abertura', label: 'ABERTURA', placeholder: 'Ex: 14:00' },
  { key: 'inicio', label: 'INÍCIO', placeholder: 'Ex: 20:45' }
];

// ---------- Imagem ----------

function setPreview(src) {
  if (src) {
    thumbPreview.src = src;
    thumbPreview.style.display = 'block';
  } else {
    thumbPreview.removeAttribute('src');
    thumbPreview.style.display = 'none';
  }
}

function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('read_error')); };
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('image_error')); };
    img.src = src;
  });
}

async function prepareImage(file) {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('too_large');
  }

  var dataUrl = await readFileAsDataUrl(file);
  var img = await loadImage(dataUrl);

  var maxSide = 1200;
  var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  var width = Math.round(img.width * scale);
  var height = Math.round(img.height * scale);

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141f22';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', 0.82);
}

eventoThumbFile.addEventListener('change', async function () {
  var file = eventoThumbFile.files && eventoThumbFile.files[0];
  if (!file) return;

  uploadHint.hidden = true;

  try {
    customThumb = await prepareImage(file);
    eventoThumb.value = CUSTOM_THUMB_VALUE;
    setPreview(customThumb);
    uploadHint.textContent = 'Imagem otimizada automaticamente para caber no armazenamento local.';
    uploadHint.hidden = false;
  } catch (error) {
    uploadHint.textContent = error.message === 'too_large'
      ? 'Imagem muito grande. Escolha um arquivo de até 12 MB.'
      : 'Não foi possível processar essa imagem.';
    uploadHint.hidden = false;
  } finally {
    eventoThumbFile.value = '';
  }
});

eventoThumb.addEventListener('change', function () {
  if (eventoThumb.value === CUSTOM_THUMB_VALUE) {
    if (customThumb) setPreview(customThumb);
    return;
  }

  customThumb = null;
  setPreview(eventoThumb.value);
  uploadHint.hidden = true;
});

function selectedThumb() {
  if (eventoThumb.value === CUSTOM_THUMB_VALUE) return customThumb || 'assets/best.png';
  return eventoThumb.value;
}

// ---------- Formulário ----------

function criarCardIngresso(dados, index) {
  var card = document.createElement('div');
  card.className = 'ingresso-card';

  var header = document.createElement('div');
  header.className = 'ingresso-header';

  var num = document.createElement('span');
  num.className = 'ingresso-num';
  num.textContent = 'Ingresso ' + (index + 1);

  var btnRem = document.createElement('button');
  btnRem.type = 'button';
  btnRem.className = 'btn-remove';
  btnRem.textContent = '✕ Remover';
  btnRem.addEventListener('click', function () {
    card.remove();
    renumerar();
  });

  header.appendChild(num);
  header.appendChild(btnRem);
  card.appendChild(header);

  var row1 = document.createElement('div');
  row1.className = 'row';
  row1.appendChild(criarCampo(camposTemplate[0], dados));
  row1.appendChild(criarCampo(camposTemplate[1], dados));
  card.appendChild(row1);

  card.appendChild(criarCampo(camposTemplate[2], dados));
  card.appendChild(criarCampo(camposTemplate[3], dados));

  var row2 = document.createElement('div');
  row2.className = 'row';
  row2.appendChild(criarCampo(camposTemplate[4], dados));
  row2.appendChild(criarCampo(camposTemplate[5], dados));
  card.appendChild(row2);

  var row3 = document.createElement('div');
  row3.className = 'row';
  row3.appendChild(criarCampo(camposTemplate[6], dados));
  row3.appendChild(criarCampo(camposTemplate[7], dados));
  card.appendChild(row3);

  return card;
}

function criarCampo(campo, dados) {
  var div = document.createElement('div');
  div.className = 'field';

  var label = document.createElement('label');
  label.textContent = campo.label;

  var input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('data-key', campo.key);
  input.placeholder = campo.placeholder;
  if (dados && dados[campo.key]) input.value = dados[campo.key];

  div.appendChild(label);
  div.appendChild(input);
  return div;
}

function renumerar() {
  var cards = ingressosList.querySelectorAll('.ingresso-card');
  cards.forEach(function (card, i) {
    card.querySelector('.ingresso-num').textContent = 'Ingresso ' + (i + 1);
  });
}

function adicionarIngresso(dados) {
  var index = ingressosList.querySelectorAll('.ingresso-card').length;
  var card = criarCardIngresso(dados || {}, index);
  ingressosList.appendChild(card);
}

function preencherFormulario(dados) {
  if (!dados) return;

  if (dados.ingressos && dados.ingressos.length > 0) {
    dados.ingressos.forEach(function (ing, i) {
      ingressosList.appendChild(criarCardIngresso(ing, i));
    });
  } else {
    adicionarIngresso();
  }
}

function showToast(message, isError) {
  toast.textContent = message;
  toast.classList.toggle('error', Boolean(isError));
  toast.classList.add('show');
  setTimeout(function () {
    toast.classList.remove('show');
  }, 2400);
}

function salvar() {
  var dados = {
    evento: {
      nome: eventoNome.value.trim(),
      data: eventoData.value.trim(),
      horario: eventoHorario.value.trim(),
      local: eventoLocal.value.trim(),
      thumb: selectedThumb()
    },
    ingressos: []
  };

  var cards = ingressosList.querySelectorAll('.ingresso-card');
  cards.forEach(function (card) {
    var ing = {};
    card.querySelectorAll('input').forEach(function (input) {
      var key = input.getAttribute('data-key');
      if (key) ing[key] = input.value.trim();
    });
    dados.ingressos.push(ing);
  });

  try {
    saveData(dados);
  } catch (error) {
    showToast('Armazenamento cheio. Use uma imagem menor.', true);
    return false;
  }

  showToast('Salvo com sucesso!', false);
  return true;
}

// ---------- Backup ----------

function exportarDados() {
  var dados = resolveData().data;
  var blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  var stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = 'meus-ingressos-' + stamp + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast('Backup exportado!', false);
}

async function importarDados(file) {
  try {
    var text = await file.text();
    var parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.ingressos)) {
      throw new Error('formato_invalido');
    }

    saveData({
      evento: parsed.evento && typeof parsed.evento === 'object' ? parsed.evento : {},
      ingressos: parsed.ingressos
    });

    showToast('Backup importado!', false);
    setTimeout(function () { window.location.reload(); }, 700);
  } catch (error) {
    showToast('Arquivo inválido. Use um JSON exportado pelo app.', true);
  }
}

// ---------- Sessão ----------

function updateTimer(expiresAt) {
  var remaining = expiresAt - Date.now();
  sessionTimer.textContent = 'expira em ' + formatRemaining(remaining);
  sessionTimer.classList.toggle('warning', remaining < 5 * 60 * 1000);
}

function setupSession(session) {
  updateTimer(session.expiresAt);

  var isAdmin = session.role !== 'guest';

  if (roleBadge) {
    roleBadge.hidden = false;
    roleBadge.textContent = isAdmin ? 'Admin' : 'Convidado';
    roleBadge.classList.toggle('admin', isAdmin);
    roleBadge.classList.toggle('guest', !isAdmin);
  }

  if (!isAdmin) {
    if (securityTitle) securityTitle.hidden = true;
    if (securityCard) securityCard.hidden = true;
  }

  createSessionWatcher(session, {
    onUpdate: function (state) {
      updateTimer(state.expiresAt);
    },
    onExpire: function () {
      window.location.replace('login.html?reason=expired');
    }
  });
}

// ---------- Init ----------

async function init() {
  var session;

  try {
    session = await requireSession();
  } catch (error) {
    return; // requireSession já redirecionou
  }

  document.body.classList.remove('auth-pending');
  document.body.classList.add('auth-ready');
  setupSession(session);

  btnAdd.addEventListener('click', function () {
    adicionarIngresso();
  });

  btnSave.addEventListener('click', function () {
    salvar();
  });

  btnPreview.addEventListener('click', function () {
    if (salvar()) window.location.href = 'ingresso.html';
  });

  btnReset.addEventListener('click', function () {
    if (!window.confirm('Restaurar os ingressos de exemplo? O estado atual será guardado no backup.')) return;
    try {
      restoreDefaults();
    } catch (error) {
      showToast('Não foi possível restaurar agora.', true);
      return;
    }
    window.location.reload();
  });

  btnLogout.addEventListener('click', function () {
    logout();
  });

  if (btnExport) {
    btnExport.addEventListener('click', exportarDados);
  }

  if (btnRestoreBackup) {
    btnRestoreBackup.addEventListener('click', function () {
      if (!hasBackup()) {
        showToast('Nenhum backup disponível ainda.', true);
        return;
      }
      if (!window.confirm('Restaurar o último backup? Os dados atuais serão substituídos.')) return;

      if (restoreBackup()) {
        showToast('Backup restaurado!', false);
        setTimeout(function () { window.location.reload(); }, 700);
      } else {
        showToast('Não foi possível restaurar o backup.', true);
      }
    });
  }

  if (importFile) {
    importFile.addEventListener('change', function () {
      var file = importFile.files && importFile.files[0];
      if (file) importarDados(file);
      importFile.value = '';
    });
  }

  var resolved = resolveData();
  var dados = resolved.data;

  preencherFormulario({ ingressos: dados.ingressos });

  if (dataNotice) dataNotice.hidden = !resolved.isFallback;

  eventoNome.value = dados.evento.nome || '';
  eventoData.value = dados.evento.data || '';
  eventoHorario.value = dados.evento.horario || '';
  eventoLocal.value = dados.evento.local || '';

  if (dados.evento.thumb) {
    if (dados.evento.thumb.indexOf('data:') === 0) {
      customThumb = dados.evento.thumb;
      eventoThumb.value = CUSTOM_THUMB_VALUE;
      setPreview(dados.evento.thumb);
    } else {
      var hasOption = Array.prototype.some.call(eventoThumb.options, function (option) {
        return option.value === dados.evento.thumb;
      });
      eventoThumb.value = hasOption ? dados.evento.thumb : 'assets/best.png';
      setPreview(eventoThumb.value);
    }
  } else {
    setPreview(eventoThumb.value);
  }

  if (session.role !== 'guest') initDevices();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(function () { console.log('SW registrado'); })
      .catch(function (err) { console.log('SW erro:', err); });
  }
}

init();
