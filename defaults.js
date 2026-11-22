// Dados padrão e camada de persistência compartilhada.
// Regra de ouro: nunca apagar dados sem antes guardar um backup.

export const STORAGE_KEY = 'meus-ingressos-data';
export const BACKUP_KEY = 'meus-ingressos-data-backup';

export const DEFAULT_DATA = {
  evento: {
    nome: 'Best of Blues and Rock',
    data: '22/11/2026',
    horario: '16:00hs',
    local: 'Auditório do Ibirapuera (Platéia Externa)',
    thumb: 'assets/best.png'
  },
  ingressos: [
    {
      setor: 'Arena Gramado',
      acesso: 'Portão 03 e 10',
      titular: 'Camila Souza - 121.714.481-89',
      taxa: '-',
      secao: 'ARENA GRAMADO',
      fileira: 'Não numerado',
      abertura: '14:00',
      inicio: '16:00'
    },
    {
      setor: 'Arena Gramado',
      acesso: 'Portão 03, 10',
      titular: 'Camila Guedes - 121.714.481-87',
      taxa: '-',
      secao: 'ARENA GRAMADO',
      fileira: 'Não numerado',
      abertura: '14:00',
      inicio: '16:00'
    },
    {
      setor: 'Arena Gramado',
      acesso: 'Portão 03, 10',
      titular: 'Camila Souza - 121.714.481-87',
      taxa: '-',
      secao: 'ARENA GRAMADO',
      fileira: 'Não numerado',
      abertura: '14:00',
      inicio: '16:00'
    },
    {
      setor: 'Arena Gramado',
      acesso: 'Portão 03 e 10',
      titular: 'Camila Souza - 121.714.481-87',
      taxa: '-',
      secao: 'ARENA GRAMADO',
      fileira: 'Não numerado',
      abertura: '14:00',
      inicio: '16:00'
    }
  ]
};

export function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function parseStored(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function readSavedData() {
  return parseStored(STORAGE_KEY);
}

export function readBackupData() {
  return parseStored(BACKUP_KEY);
}

export function hasBackup() {
  return Boolean(readBackupData());
}

// Retorna sempre um conjunto completo de dados, sem sobrescrever nada.
export function resolveData() {
  const saved = readSavedData();

  if (!saved) {
    return { data: cloneData(DEFAULT_DATA), isFallback: true };
  }

  const ev = saved.evento || {};
  const evento = {
    nome: ev.nome || DEFAULT_DATA.evento.nome,
    data: ev.data || DEFAULT_DATA.evento.data,
    horario: ev.horario || DEFAULT_DATA.evento.horario,
    local: ev.local || DEFAULT_DATA.evento.local,
    thumb: ev.thumb || DEFAULT_DATA.evento.thumb
  };

  const hasTickets = Array.isArray(saved.ingressos) && saved.ingressos.length > 0;
  const ingressos = hasTickets ? saved.ingressos : cloneData(DEFAULT_DATA.ingressos);

  return { data: { evento, ingressos }, isFallback: !hasTickets };
}

export function writeData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Salva sem perder o que já existia: o valor anterior vira backup.
export function saveData(data) {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) {
    try {
      localStorage.setItem(BACKUP_KEY, current);
    } catch (e) {
      // Se o backup falhar (armazenamento cheio), não impede o salvamento.
    }
  }
  writeData(data);
}

export function restoreDefaults() {
  saveData(cloneData(DEFAULT_DATA));
}

export function restoreBackup() {
  const backup = readBackupData();
  if (!backup) return false;
  writeData(backup);
  return true;
}
