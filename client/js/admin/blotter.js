const TRANSITIONS = {
  'Open':            ['Under Mediation', 'Resolved', 'Endorsed to Court', 'Voided'],
  'Under Mediation': ['Resolved', 'Endorsed to Court', 'Voided'],
};
const LOCKING_STATUSES = ['Resolved', 'Endorsed to Court', 'Voided'];

let currentEntryId = null;
let currentEntryStatus = null;
let pendingStatus = null;

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  await populatePurokSelect(document.getElementById('filter-purok'), { placeholder: 'All Puroks' });
  await populatePurokSelect(document.getElementById('e-purok'),      { placeholder: '— Select —' });

  const searchInput = document.getElementById('search-blotter');
  let debounceTimer;
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadEntries(); });
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadEntries, 350);
  });
  document.getElementById('filter-status').addEventListener('change', loadEntries);
  document.getElementById('filter-purok').addEventListener('change', loadEntries);
  document.getElementById('entry-form').addEventListener('submit', handleEntrySubmit);

  await loadEntries();
})();

async function loadEntries() {
  const status = document.getElementById('filter-status').value;
  const purok  = document.getElementById('filter-purok').value;
  const search = document.getElementById('search-blotter').value.trim();

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (purok)  params.append('purok_id', purok);
  if (search) params.append('search', search);

  const tbody = document.getElementById('blotter-body');
  tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">Loading…</td></tr>`;

  const res = await api.get(`/blotter?${params}`);
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-red-400">Failed to load.</td></tr>`;
    return;
  }
  const entries = await res.json();

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">No blotter entries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(b => `
    <tr class="table-row">
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${b.entry_no}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${b.nature}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${b.complainant_name}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${b.respondent_name}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${b.purok_name || '—'}</td>
      <td class="px-4 py-3">${blotterStatusBadge(b.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(b.filed_at)}</td>
      <td class="px-4 py-3">
        <button onclick="openDetailModal(${b.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
    </tr>`).join('');
}

function openNewEntryModal() {
  document.getElementById('entry-form').reset();
  document.getElementById('new-entry-modal').classList.remove('hidden');
}
function closeNewEntryModal() { document.getElementById('new-entry-modal').classList.add('hidden'); }

async function handleEntrySubmit(e) {
  e.preventDefault();
  const payload = {
    complainant_name:    document.getElementById('e-complainant_name').value.trim(),
    complainant_address: document.getElementById('e-complainant_address').value.trim() || null,
    complainant_contact: document.getElementById('e-complainant_contact').value.trim() || null,
    respondent_name:      document.getElementById('e-respondent_name').value.trim(),
    respondent_address:   document.getElementById('e-respondent_address').value.trim() || null,
    respondent_contact:   document.getElementById('e-respondent_contact').value.trim() || null,
    nature:    document.getElementById('e-nature').value.trim(),
    narrative: document.getElementById('e-narrative').value.trim(),
    purok_id:  document.getElementById('e-purok').value || null,
  };

  const btn = document.getElementById('entry-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Filing…';

  const res = await api.post('/blotter', payload);

  btn.disabled = false;
  btn.textContent = 'File Entry';

  if (res && res.ok) {
    showToast('Blotter entry filed');
    closeNewEntryModal();
    await loadEntries();
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Error filing entry', 'error');
  }
}

async function openDetailModal(id) {
  currentEntryId = id;
  document.getElementById('detail-modal').classList.remove('hidden');
  const res = await api.get(`/blotter/${id}`);
  if (!res || !res.ok) return;
  const entry = await res.json();
  currentEntryStatus = entry.status;

  document.getElementById('detail-entry-no').textContent = entry.entry_no;

  document.getElementById('detail-content').innerHTML = `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Nature</span><p class="font-semibold">${entry.nature}</p></div>
      <div><span class="text-gray-500">Status</span><p>${blotterStatusBadge(entry.status)}</p></div>
      <div><span class="text-gray-500">Purok</span><p class="font-semibold">${entry.purok_name || '—'}</p></div>
      <div><span class="text-gray-500">Filed by</span><p class="font-semibold">${entry.filed_by_name || '—'}</p></div>

      <div class="col-span-2 border-t border-gray-100 pt-3"><span class="text-gray-500 text-xs uppercase font-semibold">Complainant</span>
        <p class="font-semibold">${entry.complainant_name}</p>
        <p class="text-xs text-gray-500">${entry.complainant_address || 'No address on file'} ${entry.complainant_contact ? '· ' + entry.complainant_contact : ''}</p>
      </div>
      <div class="col-span-2"><span class="text-gray-500 text-xs uppercase font-semibold">Respondent</span>
        <p class="font-semibold">${entry.respondent_name}</p>
        <p class="text-xs text-gray-500">${entry.respondent_address || 'No address on file'} ${entry.respondent_contact ? '· ' + entry.respondent_contact : ''}</p>
      </div>

      <div class="col-span-2"><span class="text-gray-500">Narrative</span><p class="bg-gray-50 rounded-lg p-3 mt-1">${entry.narrative}</p></div>
      ${entry.action_taken ? `<div class="col-span-2"><span class="text-gray-500">Action Taken / Closing Note</span><p class="bg-gray-50 rounded-lg p-3 mt-1">${entry.action_taken}</p></div>` : ''}

      <div class="col-span-2"><span class="text-gray-500">Filed at</span><p class="font-semibold">${formatDate(entry.filed_at)}</p></div>
      ${entry.resolved_at ? `<div class="col-span-2"><span class="text-gray-500">Resolved at</span><p class="font-semibold">${formatDate(entry.resolved_at)}</p></div>` : ''}
    </div>`;

  const lockWrap = document.getElementById('lock-banner-wrap');
  const statusWrap = document.getElementById('status-change-wrap');
  if (entry.is_locked) {
    lockWrap.innerHTML = `<div class="bg-slate-100 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-center gap-2">
      <i class="fa-solid fa-lock"></i> This entry is locked. It can no longer be edited or have its status changed.
    </div>`;
    statusWrap.classList.add('hidden');
  } else {
    lockWrap.innerHTML = '';
    statusWrap.classList.remove('hidden');
    renderStatusButtons(entry.status);
  }
  cancelStatusChange();

  const logs = entry.logs || [];
  document.getElementById('detail-log').innerHTML = logs.length
    ? logs.map(l => `
        <div class="flex gap-3 text-xs">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
          <div>
            <span class="font-medium text-gray-700">${l.action}</span>
            ${l.note ? `<span class="text-gray-500"> — ${l.note}</span>` : ''}
            <span class="text-gray-400 block">${l.actor_name || 'System'} · ${formatDate(l.logged_at)}</span>
          </div>
        </div>`).join('')
    : `<p class="text-gray-400 text-xs">No activity logged.</p>`;
}

function renderStatusButtons(status) {
  const options = TRANSITIONS[status] || [];
  const wrap = document.getElementById('status-buttons');
  if (!options.length) { wrap.innerHTML = `<p class="text-xs text-gray-400">No further transitions available.</p>`; return; }
  wrap.innerHTML = options.map(s => `
    <button onclick="selectStatus('${s}')" class="btn-secondary btn-sm">${s}</button>
  `).join('');
}

function selectStatus(status) {
  pendingStatus = status;
  document.getElementById('status-note-wrap').classList.remove('hidden');
  document.getElementById('status-note').value = '';
  document.getElementById('status-note').focus();
}

function cancelStatusChange() {
  pendingStatus = null;
  document.getElementById('status-note-wrap').classList.add('hidden');
}

async function confirmStatusChange() {
  if (!currentEntryId || !pendingStatus) return;
  const note = document.getElementById('status-note').value.trim();
  if (LOCKING_STATUSES.includes(pendingStatus) && !note) {
    showToast(`A closing note is required to mark this entry as "${pendingStatus}"`, 'error');
    return;
  }

  const res = await api.patch(`/blotter/${currentEntryId}/status`, { status: pendingStatus, note: note || undefined });
  if (res && res.ok) {
    showToast('Status updated');
    await openDetailModal(currentEntryId);
    await loadEntries();
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Error updating status', 'error');
  }
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
  currentEntryId = null;
  currentEntryStatus = null;
  cancelStatusChange();
}
