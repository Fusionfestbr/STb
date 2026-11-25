import {
  createSessionWatcher,
  formatRemaining,
  logout,
  requireAdminSession
} from './auth.js';
import { initDevices } from './admin-devices.js';
import {
  DEFAULT_DATA,
  cloneData,
  readBackupData,
  resolveData
} from './defaults.js';
import {
  fetchSharedBackup,
  loadData,
  publishSharedData
} from './data.js';

var CUSTOM_THUMB_VALUE = '__custom';

// Se o navegador restaurar a página do cache (botão voltar), valida de novo.
window.addEventListener('pageshow', function (event) {
  if (event.persisted) window.location.reload();
});

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
var dataNotice = document.getElementById('dataNotice');
var btnExport = document.getElementById('btnExport');
var importFile = document.getElementById('importFile');
var btnRestoreBackup = document.getElementById('btnRestoreBackup');
var btnRestoreServerBackup = document.getElementById('btnRestoreServerBackup');

var customThumb = null;
var lastVersion = 0;
var lastData = null;
var saving = false;

var camposTemplate = [
  { key: 'setor', label: 'SETOR', placeholder: 'Ex: Cadeira Superior' },
  { key: 'acesso', label: 'ACESSO', placeholder: 'Ex: Portão B' },
  { key: 'titular', label: 'TITULAR', placeholder: 'Ex: Camila Souza - 121.714.481-87' },
  { key: 'taxa', label: 'TAXA', placeholder: 'Ex: INTEIRA - R$380,00' },
  { key: 'secao', label: 'SEÇÃO', placeholder: 'Ex: CADEIRA SUPERIOR' },
  { key: 'fileira', label: 'FILEIRA', placeholder: 'Ex: Não numerado' },
  { key: 'abertura', label: 'ABERTURA', placeholder: 'Ex: 19:30' },
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

function renderImage(img, maxSide, quality) {
  var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  var width = Math.max(1, Math.round(img.width * scale));
  var height = Math.max(1, Math.round(img.height * scale));

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141f22';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

async function prepareImage(file) {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('too_large');
  }

  var dataUrl = await readFileAsDataUrl(file);
  var img = await loadImage(dataUrl);
  var attempts = [
    [1200, 0.82],
    [1100, 0.78],
    [1000, 0.72],
    [900, 0.68],
    [800, 0.62],
    [700, 0.58],
    [600, 0.52]
  ];
  var target = 280 * 1024;
  var best = '';

  for (var i = 0; i < attempts.length; i += 1) {
    best = renderImage(img, attempts[i][0], attempts[i][1]);
    if (best.length <= target) return best;
  }

  throw new Error('too_large_after_compress');
}

eventoThumbFile.addEventListener('change', async function () {
  var file = eventoThumbFile.files && eventoThumbFile.files[0];
  if (!file) return;

  uploadHint.hidden = true;

  try {
    customThumb = await prepareImage(file);
    eventoThumb.value = CUSTOM_THUMB_VALUE;
    setPreview(customThumb);
    uploadHint.textContent = 'Imagem otimizada automaticamente para o armazenamento compartilhado.';
    uploadHint.hidden = false;
  } catch (error) {
    uploadHint.textContent = error.message === 'too_large'
      ? 'Imagem muito grande. Escolha um arquivo de até 12 MB.'
      : error.message === 'too_large_after_compress'
        ? 'Imagem muito grande mesmo após a compressão. Escolha uma imagem menor.'
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
  if (eventoThumb.value === CUSTOM_THUMB_VALUE) return customThumb || 'assets/new.png';
  return eventoThumb.value;
}

// ---------- Formulário ----------

function criarCardIngresso(dados, index) {
  var card = document.createElement('div');
  card.className = 'ingresso-card';

  var isFixed = Boolean(dados && dados.fixedId);
  if (isFixed) {
    card.dataset.fixedId = dados.fixedId;
    card.classList.add('fixed');
  }

  var header = document.createElement('div');
  header.className = 'ingresso-header';

  var num = document.createElement('span');
  num.className = 'ingresso-num';
  num.textContent = 'Ingresso ' + (index + 1);

  header.appendChild(num);

  if (isFixed) {
    var fixedBadge = document.createElement('span');
    fixedBadge.className = 'fixed-badge';
    fixedBadge.textContent = 'Fixo';
    header.appendChild(fixedBadge);
  }

  var btnRem = document.createElement('button');
  btnRem.type = 'button';
  btnRem.className = 'btn-remove';
  btnRem.textContent = '✕ Remover';
  btnRem.addEventListener('click', function () {
    card.remove();
    renumerar();
  });

  if (isFixed) btnRem.hidden = true;

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

function dadosDoFormulario() {
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
    if (card.dataset.fixedId) ing.fixedId = card.dataset.fixedId;
    card.querySelectorAll('input').forEach(function (input) {
      var key = input.getAttribute('data-key');
      if (key) ing[key] = input.value.trim();
    });
    dados.ingressos.push(ing);
  });

  return dados;
}

function setPublishing(active) {
  btnSave.disabled = active;
  if (btnAdd) btnAdd.disabled = active;
  if (btnPreview) btnPreview.disabled = active;
  if (btnReset) btnReset.disabled = active;
  btnSave.textContent = active ? 'Publicando...' : 'Salvar';
}

function publishErrorMessage(error) {
  if (!error) return 'Não foi possível publicar. Tente novamente.';
  if (error.status === 409) return 'Outro dispositivo publicou antes. Recarregue a página para ver a versão mais recente.';
  if (error.status === 413) return 'Conteúdo muito grande. Envie uma imagem menor e salve novamente.';
  if (error.status === 403) return 'Sua sessão não permite publicar. Entre novamente como admin.';
  if (error.status === 401) return 'Sessão expirada. Entre novamente para publicar.';
  if (error.status === 0) return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  return 'Não foi possível publicar. Tente novamente em instantes.';
}

async function publicar(dados, mensagem) {
  if (saving) return false;

  saving = true;
  setPublishing(true);

  try {
    var result = await publishSharedData(dados, lastVersion);
    lastVersion = result.version;
    lastData = result.data;
    showNotice('');
    showToast(mensagem || 'Publicado para todos os aparelhos!', false);
    return true;
  } catch (error) {
    showToast(publishErrorMessage(error), true);
    return false;
  } finally {
    saving = false;
    setPublishing(false);
  }
}

async function salvar() {
  return publicar(dadosDoFormulario(), 'Salvo e publicado para todos os aparelhos!');
}

// ---------- Backup ----------

function exportarDados() {
  var dados = lastData || resolveData().data;
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
  var parsed;

  try {
    var text = await file.text();
    parsed = JSON.parse(text);
  } catch (error) {
    showToast('Arquivo inválido. Use um JSON exportado pelo app.', true);
    return;
  }

  var source = parsed && parsed.data && Array.isArray(parsed.data.ingressos)
    ? parsed.data
    : parsed;

  if (!source || typeof source !== 'object' || !Array.isArray(source.ingressos)) {
    showToast('Arquivo inválido. Use um JSON exportado pelo app.', true);
    return;
  }

  var ok = await publicar({
    evento: source.evento && typeof source.evento === 'object' ? source.evento : {},
    ingressos: source.ingressos
  }, 'Backup importado e publicado para todos!');

  if (ok) setTimeout(function () { window.location.reload(); }, 700);
}

async function publicarBackup(backupData, mensagem) {
  if (!backupData || !Array.isArray(backupData.ingressos)) {
    showToast('Nenhum backup disponível ainda.', true);
    return;
  }

  var ok = await publicar(backupData, mensagem);
  if (ok) setTimeout(function () { window.location.reload(); }, 700);
}

function restaurarBackupLocal() {
  return publicarBackup(readBackupData(), 'Backup local restaurado e publicado para todos!');
}

async function restaurarBackupServidor() {
  var backupData = null;

  try {
    var response = await fetchSharedBackup();
    if (response && response.backup && response.backup.data) {
      backupData = response.backup.data;
    }
  } catch (error) {
    // Sem backup no servidor ou sem conexão.
  }

  return publicarBackup(backupData, 'Backup do servidor restaurado e publicado para todos!');
}

// ---------- Sessão ----------

function updateTimer(expiresAt) {
  var remaining = expiresAt - Date.now();
  sessionTimer.textContent = 'expira em ' + formatRemaining(remaining);
  sessionTimer.classList.toggle('warning', remaining < 5 * 60 * 1000);
}

function setupSession(session) {
  updateTimer(session.expiresAt);

  if (roleBadge) {
    roleBadge.hidden = false;
    roleBadge.textContent = 'Admin';
    roleBadge.classList.add('admin');
    roleBadge.classList.remove('guest');
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

function showNotice(message) {
  if (!dataNotice) return;
  dataNotice.textContent = message || '';
  dataNotice.hidden = !message;
}

async function init() {
  var session;

  try {
    session = await requireAdminSession();
  } catch (error) {
    return; // requireAdminSession já redirecionou
  }

  setupSession(session);

  btnAdd.addEventListener('click', function () {
    adicionarIngresso();
  });

  btnSave.addEventListener('click', function () {
    salvar();
  });

  btnPreview.addEventListener('click', async function () {
    if (await salvar()) window.location.href = 'ingresso.html';
  });

  btnReset.addEventListener('click', async function () {
    if (!window.confirm('Restaurar os ingressos de exemplo para TODOS os aparelhos? O estado atual será guardado no backup.')) return;

    var ok = await publicar(cloneData(DEFAULT_DATA), 'Ingressos de exemplo publicados para todos!');
    if (ok) setTimeout(function () { window.location.reload(); }, 700);
  });

  btnLogout.addEventListener('click', function () {
    logout();
  });

  if (btnExport) {
    btnExport.addEventListener('click', exportarDados);
  }

  if (btnRestoreBackup) {
    btnRestoreBackup.addEventListener('click', async function () {
      if (!window.confirm('Restaurar o backup local deste aparelho? Ele será publicado para todos.')) return;
      await restaurarBackupLocal();
    });
  }

  if (btnRestoreServerBackup) {
    btnRestoreServerBackup.addEventListener('click', async function () {
      if (!window.confirm('Restaurar o último backup do servidor? Ele será publicado para todos.')) return;
      await restaurarBackupServidor();
    });
  }

  if (importFile) {
    importFile.addEventListener('change', function () {
      var file = importFile.files && importFile.files[0];
      if (file) importarDados(file);
      importFile.value = '';
    });
  }

  var loaded = await loadData({ migrateLocal: true });
  var dados = loaded.data;

  lastVersion = loaded.version || 0;
  lastData = dados;

  preencherFormulario({ ingressos: dados.ingressos });

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
      eventoThumb.value = hasOption ? dados.evento.thumb : 'assets/new.png';
      setPreview(eventoThumb.value);
    }
  } else {
    setPreview(eventoThumb.value);
  }

  if (loaded.source === 'migrated') {
    showNotice('Seus ingressos deste aparelho foram publicados e já aparecem em todos os aparelhos.');
  } else if (loaded.source === 'default') {
    showNotice('Nenhum ingresso foi publicado ainda. Clique em Salvar para publicar para todos.');
  } else if (loaded.error) {
    showNotice('Sem conexão com o servidor. Mostrando a cópia salva neste aparelho; verifique a internet antes de salvar.');
  } else if (loaded.localBackedUp) {
    showNotice('Dados compartilhados carregados. A versão anterior deste aparelho foi guardada no backup local.');
  } else if (loaded.conflict) {
    showNotice('Outra aba publicou primeiro; os dados mais recentes foram carregados.');
  } else if (loaded.source === 'cache') {
    showNotice('Estes ingressos ainda não foram publicados. Clique em Salvar para compartilhar.');
  } else {
    showNotice('');
  }

  document.body.classList.remove('auth-pending');
  document.body.classList.add('auth-ready');

  if (session.role === 'admin') initDevices();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(function () { console.log('SW registrado'); })
      .catch(function (err) { console.log('SW erro:', err); });
  }
}

init();
