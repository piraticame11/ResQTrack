function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

function requireAuth() {
  const token = localStorage.getItem('accessToken');
  const user  = getUser();
  if (!token || !user) {
    window.location.href = '/pages/shared/login.html';
    return null;
  }
  return user;
}

function requireRole(...roles) {
  const user = requireAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    window.location.href = '/pages/shared/login.html';
    return null;
  }
  return user;
}

function logout() {
  const token = localStorage.getItem('accessToken');
  if (token) {
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {}); // best-effort — don't block logout on network failure
  }
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/pages/shared/login.html';
}

function setUserUI(user) {
  const nameEl   = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl && user) nameEl.textContent = user.name;
  if (avatarEl && user) {
    if (user.profile_photo) {
      avatarEl.innerHTML = `<img src="${user.profile_photo}" class="w-full h-full object-cover rounded-full" alt="">`;
    } else {
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  const map = {
    Pending:    'badge-pending',
    Dispatched: 'badge-dispatched',
    Initiate:   'badge-initiate',
    Delayed:    'badge-delayed',
    Resolved:   'badge-resolved',
    Archived:   'badge-archived',
  };
  return `<span class="${map[status] || 'badge-pending'}">${status}</span>`;
}

function triageBadge(color) {
  const map = { Red: 'triage-red', Orange: 'triage-orange', Yellow: 'triage-yellow', Green: 'triage-green' };
  return `<span class="${map[color] || 'triage-yellow'}">${color}</span>`;
}

// Which status buttons make sense to offer next, given the current one.
// Shared by admin + responder incident views so the workflow stays consistent.
const INCIDENT_TRANSITIONS = {
  Dispatched: ['Initiate', 'Delayed', 'Resolved'],
  Initiate:   ['Delayed', 'Resolved'],
  Delayed:    ['Initiate', 'Resolved'],
};

const STATUS_LEGEND = [
  ['Pending',    'Reported, not yet assigned to a responder.'],
  ['Dispatched', 'A responder has been assigned and is on the way.'],
  ['Initiate',   'The responder has arrived and started handling it.'],
  ['Delayed',    'The responder is behind schedule — held up en route or on scene.'],
  ['Resolved',   'The incident has been fully handled.'],
  ['Archived',   'Resolved and auto-archived after 30 days.'],
];
const TRIAGE_LEGEND = [
  ['Red',    'Life-threatening — Fire or Rescue.'],
  ['Orange', 'Urgent — Crime.'],
  ['Yellow', 'Moderate — Noise or unclassified reports.'],
  ['Green',  'Low priority — Garbage/sanitation.'],
];

function renderLegendPanel() {
  const row = (label, badgeHtml, desc) => `
    <div class="flex items-start gap-2 py-1">
      <div class="w-24 shrink-0">${badgeHtml}</div>
      <span class="text-xs text-gray-500">${desc}</span>
    </div>`;
  return `
    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</div>
    ${STATUS_LEGEND.map(([s, d]) => row(s, statusBadge(s), d)).join('')}
    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-1">Triage Color</div>
    ${TRIAGE_LEGEND.map(([c, d]) => row(c, triageBadge(c), d)).join('')}`;
}

function toggleLegend(btnId, panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    panel.innerHTML = renderLegendPanel();
  }
  panel.classList.toggle('hidden');
}

function blotterStatusBadge(status) {
  const map = {
    'Open':               'badge-open',
    'Under Mediation':    'badge-mediation',
    'Resolved':           'badge-resolved',
    'Endorsed to Court':  'badge-endorsed',
    'Voided':             'badge-voided',
  };
  return `<span class="${map[status] || 'badge-open'}">${status}</span>`;
}

function typeColor(type) {
  const map = {
    Fire:    'bg-red-100 text-red-700',
    Rescue:  'bg-red-100 text-red-700',
    Crime:   'bg-orange-100 text-orange-700',
    Noise:   'bg-yellow-100 text-yellow-700',
    Garbage: 'bg-green-100 text-green-700',
    Other:   'bg-gray-100 text-gray-700',
  };
  return map[type] || 'bg-gray-100 text-gray-700';
}

// Offline incident-report queue — flushes automatically once connectivity
// returns, from whichever page the user happens to be on.
async function flushOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('resqtrack_offline_queue') || '[]');
  if (!queue.length || !navigator.onLine || !localStorage.getItem('accessToken')) return;

  const remaining = [];
  let sent = 0;
  for (const entry of queue) {
    try {
      const fd = new FormData();
      fd.append('incident_type', entry.incident_type);
      fd.append('description', entry.description);
      if (entry.purok_id)  fd.append('purok_id', entry.purok_id);
      if (entry.latitude)  fd.append('latitude', entry.latitude);
      if (entry.longitude) fd.append('longitude', entry.longitude);
      for (const p of entry.photos || []) {
        const blob = await (await fetch(p.dataUrl)).blob();
        fd.append('photos', new File([blob], p.name, { type: p.type }));
      }
      const res = await api.postForm('/incidents', fd);
      if (res && res.ok) sent++; else remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }
  localStorage.setItem('resqtrack_offline_queue', JSON.stringify(remaining));
  if (sent > 0) showToast(`${sent} offline report${sent !== 1 ? 's' : ''} submitted`, 'success');
}

window.addEventListener('online', flushOfflineQueue);
if (navigator.onLine) setTimeout(flushOfflineQueue, 1500);

let _puroksCache = null;
async function fetchPuroks(force = false) {
  if (_puroksCache && !force) return _puroksCache;
  try {
    const res = await fetch('/api/puroks');
    _puroksCache = res.ok ? await res.json() : [];
  } catch {
    _puroksCache = [];
  }
  return _puroksCache;
}

async function populatePurokSelect(selectEl, { placeholder = '— Select Purok —' } = {}) {
  if (!selectEl) return;
  const puroks = await fetchPuroks();
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    puroks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (current) selectEl.value = current;
}

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('-translate-x-full');
  backdrop && backdrop.classList.toggle('hidden');
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  sidebar.classList.add('-translate-x-full');
  backdrop && backdrop.classList.add('hidden');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const bg    = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  toast.className = `fixed bottom-5 right-5 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 transition-opacity duration-300`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
