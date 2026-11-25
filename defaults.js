// Dados padrão e camada de persistência compartilhada.
// Regra de ouro: nunca apagar dados sem antes guardar um backup.

export const STORAGE_KEY = 'meus-ingressos-data';
export const BACKUP_KEY = 'meus-ingressos-data-backup';

// Ingressos fixos: sempre aparecem, mesmo que o armazenamento local seja
// limpo, corrompido ou que alguém tente removê-los no painel.
export const FIXED_TICKETS = [
  {
    fixedId: 'fixo-1',
    setor: 'Pista',
    acesso: '-',
    titular: 'Camila Souza - 121.714.481-89',
    taxa: '-',
    secao: 'PISTA',
    fileira: 'Não numerado',
    abertura: '19:30',
    inicio: '20:30'
  },
  {
    fixedId: 'fixo-2',
    setor: 'Pista Premium',
    acesso: '-',
    titular: 'Camila Guedes - 121.714.481-87',
    taxa: '-',
    secao: 'PISTA PREMIUM',
    fileira: 'Não numerado',
    abertura: '19:30',
    inicio: '20:30'
  },
  {
    fixedId: 'fixo-3',
    setor: 'Mezanino',
    acesso: '-',
    titular: 'Camila Souza - 121.714.481-87',
    taxa: '-',
    secao: 'MEZANINO',
    fileira: 'Não numerado',
    abertura: '19:30',
    inicio: '20:30'
  },
  {
    fixedId: 'fixo-4',
    setor: 'Camarote A',
    acesso: '-',
    titular: 'Camila Souza - 121.714.481-87',
    taxa: '-',
    secao: 'CAMAROTE A',
    fileira: 'Não numerado',
    abertura: '19:30',
    inicio: '20:30'
  },
  {
    fixedId: 'fixo-5',
    setor: 'Camarote B',
    acesso: '-',
    titular: 'Camila Souza - 121.714.481-87',
    taxa: '-',
    secao: 'CAMAROTE B',
    fileira: 'Não numerado',
    abertura: '19:30',
    inicio: '20:30'
  }
];

export const DEFAULT_DATA = {
  evento: {
    nome: 'New Order',
    data: '25/11/2026',
    horario: '19:30hs',
    local: 'Espaço Unimed',
    thumb: 'assets/new.png'
  },
  ingressos: FIXED_TICKETS
};

const TICKET_FIELDS = [
  'setor',
  'acesso',
  'titular',
  'taxa',
  'secao',
  'fileira',
  'abertura',
  'inicio'
];

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

function isTicket(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSameFields(ticket, fixed) {
  return TICKET_FIELDS.every(function (key) {
    return String(ticket[key] == null ? '' : ticket[key]) ===
      String(fixed[key] == null ? '' : fixed[key]);
  });
}

function hasSameTitular(ticket, fixed) {
  return Boolean(ticket.titular && fixed.titular && ticket.titular === fixed.titular);
}

// Mescla os fixos com os salvos, sem duplicar. Se um fixo foi editado,
// a edição é mantida; se foi apagado, o padrão volta.
//
// A busca acontece em três etapas para lidar com dados antigos:
// 1. conteúdo idêntico ao padrão (resolve IDs duplicados/renomeados);
// 2. fixedId conhecido (mantém edições feitas no painel);
// 3. titular, apenas para dados muito antigos sem fixedId.
export function mergeFixedTickets(tickets) {
  const saved = Array.isArray(tickets) ? tickets.filter(isTicket) : [];
  const used = new Set();
  const assigned = FIXED_TICKETS.map(function () { return -1; });

  function assign(match) {
    FIXED_TICKETS.forEach(function (def, defIndex) {
      if (assigned[defIndex] !== -1) return;

      const matchIndex = saved.findIndex(function (ticket, index) {
        return !used.has(index) && match(ticket, def);
      });

      if (matchIndex !== -1) {
        assigned[defIndex] = matchIndex;
        used.add(matchIndex);
      }
    });
  }

  assign(hasSameFields);
  assign(function (ticket, def) {
    return Boolean(ticket.fixedId) && ticket.fixedId === def.fixedId;
  });
  assign(function (ticket, def) {
    return !ticket.fixedId && hasSameTitular(ticket, def);
  });

  const fixed = FIXED_TICKETS.map(function (def, index) {
    const savedIndex = assigned[index];

    if (savedIndex === -1) return cloneData(def);

    return Object.assign({}, cloneData(def), saved[savedIndex], {
      fixedId: def.fixedId
    });
  });

  const extras = saved.filter(function (ticket, index) {
    return !used.has(index);
  });

  return fixed.concat(extras);
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
  const ingressos = mergeFixedTickets(saved.ingressos);

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

// Atualiza o cache local com dados vindos do servidor. Se o aparelho tinha
// uma versão diferente, ela vira backup antes de ser substituída.
export function cacheData(data) {
  const nextRaw = JSON.stringify(data);
  const currentRaw = localStorage.getItem(STORAGE_KEY);

  if (currentRaw === nextRaw) {
    return { changed: false, backedUp: false };
  }

  let backedUp = false;
  if (currentRaw) {
    try {
      localStorage.setItem(BACKUP_KEY, currentRaw);
      backedUp = true;
    } catch (e) {
      // Sem espaço para o backup: segue com a gravação principal.
    }
  }

  localStorage.setItem(STORAGE_KEY, nextRaw);
  return { changed: true, backedUp };
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
