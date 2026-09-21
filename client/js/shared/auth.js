function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

// Escape user-supplied text before interpolating it into innerHTML — without
// this, anything a resident/admin typed into a name, narrative, etc. field
// renders as live HTML for whoever views it next.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
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

  // Unified Portal & View Switcher (Admin, Responder, Resident)
  renderPortalSwitcher(user);
}

function renderPortalSwitcher(user) {
  if (!user) return;

  const path = window.location.pathname;
  let currentPortal = 'resident';
  if (path.includes('/pages/admin/')) currentPortal = 'admin';
  else if (path.includes('/pages/responder/')) currentPortal = 'responder';

  // 1. Configure Responder Sidebar Dock (if present)
  const respToAdminBtn  = document.getElementById('resp-to-admin-btn');
  const respToClientBtn = document.getElementById('resp-to-client-btn');
  if (respToClientBtn) {
    if (user.role === 'admin') {
      respToAdminBtn && respToAdminBtn.classList.remove('hidden');
      respToClientBtn.classList.remove('col-span-2');
    } else {
      respToAdminBtn && respToAdminBtn.classList.add('hidden');
      respToClientBtn.classList.add('col-span-2');
    }
  }

  // 2. Configure Header Portal Switcher (supports #portal-switcher or legacy #role-shortcuts)
  const targetEl = document.getElementById('portal-switcher') || document.getElementById('role-shortcuts');

  // Pure residents don't need portal switching or preview bar
  if (user.role !== 'admin' && user.role !== 'responder') {
    if (targetEl) targetEl.innerHTML = '';
    const existingPreview = document.getElementById('portal-preview-bar');
    if (existingPreview) existingPreview.remove();
    return;
  }

  // If on Admin or Responder portal and no target element exists, nothing to mount
  if (currentPortal !== 'resident' && !targetEl) {
    return;
  }

  // Build Portal Options
  let optionsHtml = '';

  // Admin Option
  if (user.role === 'admin') {
    if (currentPortal === 'admin') {
      optionsHtml += `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/80 border border-blue-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm shadow-sm">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <p class="text-xs font-bold text-blue-950">Admin Console</p>
              <p class="text-[11px] text-blue-700/80">Command center &amp; management</p>
            </div>
          </div>
          <span class="text-[10px] font-bold text-blue-700 bg-white px-2 py-0.5 rounded-full border border-blue-200 shadow-2xs">Active</span>
        </div>`;
    } else {
      optionsHtml += `
        <a href="/pages/admin/dashboard.html" class="flex items-center justify-between p-2.5 rounded-xl hover:bg-blue-50 text-gray-700 hover:text-blue-700 transition-colors group">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-sm group-hover:scale-105 transition-transform">
              <i class="fa-solid fa-shield-halved"></i>
            </div>
            <div>
              <p class="text-xs font-bold text-gray-800 group-hover:text-blue-700">Admin Console</p>
              <p class="text-[11px] text-gray-400">Command center, users &amp; blotters</p>
            </div>
          </div>
          <i class="fa-solid fa-arrow-right text-xs text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all"></i>
        </a>`;
    }
  }

  // Responder Option
  if (user.role === 'admin' || user.role === 'responder') {
    if (currentPortal === 'responder') {
      optionsHtml += `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm shadow-sm">
              <i class="fa-solid fa-truck-medical"></i>
            </div>
            <div>
              <p class="text-xs font-bold text-emerald-950">Responder View</p>
              <p class="text-[11px] text-emerald-700/80">Dispatch &amp; incident handling</p>
            </div>
          </div>
          <span class="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">Active</span>
        </div>`;
    } else {
      optionsHtml += `
        <a href="/pages/responder/dashboard.html" class="flex items-center justify-between p-2.5 rounded-xl hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 transition-colors group">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center text-sm group-hover:scale-105 transition-transform">
              <i class="fa-solid fa-truck-medical"></i>
            </div>
            <div>
              <p class="text-xs font-bold text-gray-800 group-hover:text-emerald-700">Responder View</p>
              <p class="text-[11px] text-gray-400">Field dispatch, map &amp; incidents</p>
            </div>
          </div>
          <i class="fa-solid fa-arrow-right text-xs text-gray-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all"></i>
        </a>`;
    }
  }

  // Resident Option
  if (currentPortal === 'resident') {
    optionsHtml += `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-cyan-50/80 border border-cyan-100">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-cyan-600 text-white flex items-center justify-center text-sm shadow-sm">
            <i class="fa-solid fa-house"></i>
          </div>
          <div>
            <p class="text-xs font-bold text-cyan-950">Resident View</p>
            <p class="text-[11px] text-cyan-700/80">Citizen reports &amp; announcements</p>
          </div>
        </div>
        <span class="text-[10px] font-bold text-cyan-700 bg-white px-2 py-0.5 rounded-full border border-cyan-200 shadow-2xs">Active</span>
      </div>`;
  } else {
    optionsHtml += `
      <a href="/pages/client/home.html" class="flex items-center justify-between p-2.5 rounded-xl hover:bg-cyan-50 text-gray-700 hover:text-cyan-700 transition-colors group">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center text-sm group-hover:scale-105 transition-transform">
            <i class="fa-solid fa-house"></i>
          </div>
          <div>
            <p class="text-xs font-bold text-gray-800 group-hover:text-cyan-700">Resident View</p>
            <p class="text-[11px] text-gray-400">Citizen emergency services</p>
          </div>
        </div>
        <i class="fa-solid fa-arrow-right text-xs text-gray-300 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all"></i>
      </a>`;
  }

  // Trigger button styling based on active portal
  let triggerBtnHtml = '';

  if (currentPortal === 'admin') {
    triggerBtnHtml = `
      <button type="button" onclick="togglePortalDropdown(event)"
              class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 shadow-xs hover:border-gray-300 transition-all focus:outline-none">
        <span class="w-2 h-2 rounded-full bg-blue-600"></span>
        <i class="fa-solid fa-shield-halved text-blue-600 text-xs"></i>
        <span class="hidden sm:inline">Admin Portal</span>
        <i class="fa-solid fa-chevron-down text-[10px] text-gray-400 ml-0.5 transition-transform" id="portal-menu-chevron"></i>
      </button>`;
  } else if (currentPortal === 'responder') {
    triggerBtnHtml = `
      <button type="button" onclick="togglePortalDropdown(event)"
              class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 shadow-xs hover:border-gray-300 transition-all focus:outline-none">
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
        <i class="fa-solid fa-truck-medical text-emerald-600 text-xs"></i>
        <span class="hidden sm:inline">Responder View</span>
        <i class="fa-solid fa-chevron-down text-[10px] text-gray-400 ml-0.5 transition-transform" id="portal-menu-chevron"></i>
      </button>`;
  } else {
    // ── RESIDENT PORTAL PREVIEW BAR ──
    // Clear in-navbar shortcuts to prevent mobile navbar overflow
    if (targetEl) targetEl.innerHTML = '';

    const exitTarget = user.role === 'admin' ? '/pages/admin/dashboard.html' : '/pages/responder/dashboard.html';
    const exitRole   = user.role === 'admin' ? 'Admin' : 'Responder';
    const exitIcon   = user.role === 'admin' ? 'fa-shield-halved text-blue-300' : 'fa-truck-medical text-emerald-300';
    const exitBtnBg  = user.role === 'admin' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500';

    let previewBar = document.getElementById('portal-preview-bar');
    if (!previewBar) {
      previewBar = document.createElement('div');
      previewBar.id = 'portal-preview-bar';
      const nav = document.querySelector('nav');
      if (nav) nav.prepend(previewBar);
      else document.body.prepend(previewBar);
    }

    previewBar.className = 'bg-slate-900 text-white px-3 sm:px-4 py-1.5 flex items-center justify-between border-b border-slate-800 text-xs w-full shrink-0';
    previewBar.style.backgroundColor = '#0f172a';
    previewBar.style.color = '#ffffff';
    previewBar.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
        <span class="text-slate-200 truncate text-[11px] sm:text-xs font-medium">
          Viewing <strong>Resident Portal</strong> <span class="text-slate-400 hidden sm:inline">(as ${exitRole})</span>
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <div class="relative inline-block text-left" id="portal-menu-container">
          <button type="button" onclick="togglePortalDropdown(event)"
                  class="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors border border-slate-700/80 shadow-xs" title="Switch Portal">
            <span>Switch</span>
            <i class="fa-solid fa-chevron-down text-[9px] text-slate-400 ml-0.5 transition-transform" id="portal-menu-chevron"></i>
          </button>
          <div id="portal-menu-dropdown"
               class="hidden absolute right-0 mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 text-gray-800 transition-all">
            <div class="px-3 py-2 border-b border-gray-100">
              <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Switch Workspace Portal</p>
              <p class="text-xs text-gray-500 mt-0.5">${user.role === 'admin' ? 'Administrator Permissions' : 'Field Responder Permissions'}</p>
            </div>
            <div class="p-1 space-y-1 mt-1">
              ${optionsHtml}
            </div>
          </div>
        </div>
        <a href="${exitTarget}" class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${exitBtnBg} text-white font-semibold text-[11px] transition-colors shadow-xs">
          <i class="fa-solid ${exitIcon} text-[10px]"></i>
          <span>Exit to ${exitRole}</span>
        </a>
      </div>`;
    return;
  }

  // If we are not in resident view, clean up any preview bar that may exist
  const existingPreview = document.getElementById('portal-preview-bar');
  if (existingPreview) existingPreview.remove();

  // Render header dropdown inside Admin/Responder headers
  targetEl.innerHTML = `
    <div class="relative inline-block text-left" id="portal-menu-container">
      ${triggerBtnHtml}
      <div id="portal-menu-dropdown"
           class="hidden absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 transition-all">
        <div class="px-3 py-2 border-b border-gray-100">
          <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Switch Workspace Portal</p>
          <p class="text-xs text-gray-500 mt-0.5">${user.role === 'admin' ? 'Administrator Permissions' : 'Field Responder Permissions'}</p>
        </div>
        <div class="p-1 space-y-1 mt-1">
          ${optionsHtml}
        </div>
      </div>
    </div>`;
}

// Global click-outside to close the portal dropdown
window.togglePortalDropdown = function(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('portal-menu-dropdown');
  const chevron  = document.getElementById('portal-menu-chevron');
  if (dropdown) {
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !isHidden);
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  }
};

document.addEventListener('click', (e) => {
  const container = document.getElementById('portal-menu-container');
  const dropdown  = document.getElementById('portal-menu-dropdown');
  const chevron   = document.getElementById('portal-menu-chevron');
  if (container && dropdown && !container.contains(e.target)) {
    dropdown.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
});

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  const map = {
    Pending:  'badge-pending',
    Assigned: 'badge-assigned',
    Initiate: 'badge-initiate',
    Delayed:  'badge-delayed',
    Resolved: 'badge-resolved',
    Archived: 'badge-archived',
  };
  return `<span class="${map[status] || 'badge-pending'}">${status}</span>`;
}

function triageBadge(color) {
  const map = { Red: 'triage-red', Orange: 'triage-orange', Yellow: 'triage-yellow', Green: 'triage-green' };
  return `<span class="${map[color] || 'triage-yellow'}" title="${color}"></span>`;
}

// Which status buttons make sense to offer next, given the current one.
// Shared by admin + responder incident views so the workflow stays consistent.
const INCIDENT_TRANSITIONS = {
  Assigned: ['Initiate', 'Delayed', 'Resolved'],
  Initiate: ['Delayed', 'Resolved'],
  Delayed:  ['Initiate', 'Resolved'],
};

// Icon shown on each status-transition button — Delayed gets its own
// look (and a required reason prompt) so it doesn't blend in with the
// other, no-explanation-needed transitions.
const STATUS_ACTION_ICON = {
  Initiate: 'fa-play',
  Delayed:  'fa-clock',
  Resolved: 'fa-circle-check',
};

const STATUS_LEGEND = [
  ['Pending',  'Reported, not yet assigned to a responder.'],
  ['Assigned', 'A responder has been assigned and is on the way.'],
  ['Initiate', 'The responder has arrived and started handling it.'],
  ['Delayed',  'The responder is behind schedule — held up en route or on scene.'],
  ['Resolved', 'The incident has been fully handled.'],
  ['Archived', 'Resolved and auto-archived after 30 days.'],
];
const TRIAGE_LEGEND = [
  ['Red',    'Life-threatening — Fire or Rescue.'],
  ['Orange', 'Urgent — Crime, Fights, or Flood.'],
  ['Yellow', 'Moderate — Noise or Missing Person.'],
  ['Green',  'Low priority — Other general concerns.'],
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
    Rescue:  'bg-blue-100 text-blue-700',
    Crime:   'bg-orange-100 text-orange-700',
    Fights:  'bg-red-100 text-red-800',
    Flood:   'bg-cyan-100 text-cyan-800',
    Missing: 'bg-purple-100 text-purple-700',
    Noise:   'bg-yellow-100 text-yellow-700',
    Other:   'bg-gray-100 text-gray-700',
    'Flagged as Fake': 'bg-gray-200 text-gray-800 border border-gray-300 font-semibold',
    Spam:    'bg-gray-200 text-gray-800 border border-gray-300 font-semibold',
  };
  return map[type] || 'bg-gray-100 text-gray-700';
}

// ── Shared "reason" modal ────────────────────────────────────────────────
// Replaces the native prompt() dialog for short required text input
// (flag-as-fake, mark-as-delayed) with a styled modal consistent with the
// rest of the app. Injected lazily into whatever page calls it, so callers
// don't need to duplicate the markup in every HTML file.
let _reasonModalCallback = null;

function _ensureReasonModal() {
  if (document.getElementById('reason-modal')) return;
  const div = document.createElement('div');
  div.id = 'reason-modal';
  div.className = 'modal-overlay hidden';
  div.innerHTML = `
    <div class="modal-box max-w-md">
      <div class="modal-header">
        <h3 class="font-bold text-gray-800 text-base" id="reason-modal-title">Reason</h3>
        <button type="button" onclick="closeReasonModal()" class="text-gray-400 hover:text-gray-600 p-1"><i class="fa-solid fa-xmark text-xl"></i></button>
      </div>
      <div class="modal-body space-y-3">
        <textarea id="reason-modal-input" rows="3" class="input-field text-sm" placeholder="Type your reason…"></textarea>
        <p id="reason-modal-error" class="hidden text-xs text-red-500">A reason is required.</p>
      </div>
      <div class="modal-footer">
        <button type="button" onclick="confirmReasonModal()" class="btn-primary flex-1 py-2.5">Confirm</button>
        <button type="button" onclick="closeReasonModal()" class="btn-secondary flex-1 py-2.5">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(div);
}

function openReasonModal(title, onConfirm) {
  _ensureReasonModal();
  document.getElementById('reason-modal-title').textContent = title;
  document.getElementById('reason-modal-input').value = '';
  document.getElementById('reason-modal-error').classList.add('hidden');
  document.getElementById('reason-modal').classList.remove('hidden');
  _reasonModalCallback = onConfirm;
  setTimeout(() => document.getElementById('reason-modal-input').focus(), 50);
}

function closeReasonModal() {
  const modal = document.getElementById('reason-modal');
  if (modal) modal.classList.add('hidden');
  _reasonModalCallback = null;
}

function confirmReasonModal() {
  const reason = document.getElementById('reason-modal-input').value.trim();
  if (!reason) {
    document.getElementById('reason-modal-error').classList.remove('hidden');
    return;
  }
  const cb = _reasonModalCallback;
  closeReasonModal();
  if (cb) cb(reason);
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

async function populatePurokSelect(selectEl, { placeholder = '— Select Purok —', barangay = '' } = {}) {
  if (!selectEl) return;
  const puroks = await fetchPuroks();
  const cleanSel = (barangay || '').toLowerCase().replace(/^(barangay|brgy\.?)\s+/i, '').trim();
  const filtered = cleanSel
    ? puroks.filter(p => {
        const pBrgy = (p.barangay || '').toLowerCase().replace(/^(barangay|brgy\.?)\s+/i, '').trim();
        return pBrgy.includes(cleanSel) || cleanSel.includes(pBrgy);
      })
    : puroks;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    filtered.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (current && filtered.some(p => String(p.id) === String(current))) selectEl.value = current;
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

function toggleMapFullscreen(cardOrContainerId, mapInstanceOrGetter, btnId) {
  const container = document.getElementById(cardOrContainerId);
  if (!container) return;

  const isFull = container.classList.toggle('map-fullscreen-active');
  const btn = btnId ? document.getElementById(btnId) : container.querySelector('.map-fullscreen-btn');

  if (btn) {
    btn.innerHTML = isFull
      ? '<i class="fa-solid fa-compress mr-1"></i><span class="text-xs">Exit Fullscreen</span>'
      : '<i class="fa-solid fa-expand mr-1"></i><span class="text-xs">Fullscreen</span>';
    btn.setAttribute('title', isFull ? 'Exit Full Screen' : 'Full Screen');
  }

  const resolveMap = () => {
    if (typeof mapInstanceOrGetter === 'function') return mapInstanceOrGetter();
    if (mapInstanceOrGetter) return mapInstanceOrGetter;
    if (window._dashMap) return window._dashMap;
    if (window.hotspotMap) return window.hotspotMap;
    if (window.incidentMap) return window.incidentMap;
    if (window.modalMap) return window.modalMap;
    if (window.locationMap) return window.locationMap;
    return null;
  };

  const map = resolveMap();
  if (map && typeof map.invalidateSize === 'function') {
    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 300);
  }

  // Escape key to exit fullscreen
  if (isFull) {
    const escHandler = (e) => {
      if (e.key === 'Escape' && container.classList.contains('map-fullscreen-active')) {
        toggleMapFullscreen(cardOrContainerId, mapInstanceOrGetter, btnId);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }
}
