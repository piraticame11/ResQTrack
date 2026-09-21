const TRANSITIONS = {
  'Open':            ['Under Mediation', 'Resolved', 'Endorsed to Court', 'Voided'],
  'Under Mediation': ['Resolved', 'Endorsed to Court', 'Voided'],
};
const LOCKING_STATUSES = ['Resolved', 'Endorsed to Court', 'Voided'];

let allEntries = [];
let allResidents = [];
let currentEntryId = null;
let currentEntryStatus = null;
let currentEntryData = null;
let pendingStatus = null;

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  await initBlotterPage();
})();

async function initBlotterPage() {
  await Promise.all([
    populatePurokSelect(document.getElementById('filter-purok'), { placeholder: 'All Puroks' }),
    populatePurokSelect(document.getElementById('e-purok'),      { placeholder: '— Select Purok —' }),
    loadResidentsCache(),
  ]);

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
  document.getElementById('notify-form').addEventListener('submit', handleNotifySubmit);

  setupAutocomplete('comp', 'e-complainant_name', 'comp-autocomplete');
  setupAutocomplete('resp', 'e-respondent_name', 'resp-autocomplete');

  await loadEntries();
}

async function loadResidentsCache() {
  try {
    const res = await api.get('/admin/users');
    if (res && res.ok) {
      const users = await res.json();
      allResidents = users.filter(u => u.role === 'resident' || u.role === 'admin' || u.role === 'responder');
    }
  } catch (err) {
    console.error('Failed to load residents for blotter search:', err);
  }
}

function setupAutocomplete(type, inputId, dropId) {
  const input = document.getElementById(inputId);
  const drop  = document.getElementById(dropId);

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      drop.innerHTML = '';
      drop.classList.add('hidden');
      return;
    }

    const matches = allResidents.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.phone && r.phone.includes(q))
    ).slice(0, 6);

    if (!matches.length) {
      drop.innerHTML = `<div class="p-2.5 text-gray-400 italic">No registered resident match. Typing new name.</div>`;
      drop.classList.remove('hidden');
      return;
    }

    drop.innerHTML = matches.map(m => `
      <div class="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors" onclick="selectResidentMatch('${type}', ${m.id})">
        <div class="font-semibold text-gray-800 flex items-center justify-between">
          <span>${escapeHtml(m.full_name)}</span>
          ${m.is_verified ? '<span class="text-[10px] text-green-600 font-normal"><i class="fa-solid fa-check mr-0.5"></i>Verified</span>' : ''}
        </div>
        <div class="text-[11px] text-gray-500 truncate">${escapeHtml(m.address_line || m.purok_name || 'No address')} · ${escapeHtml(m.phone || 'No phone')}</div>
      </div>
    `).join('');
    drop.classList.remove('hidden');
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !drop.contains(e.target)) {
      drop.classList.add('hidden');
    }
  });
}

function selectResidentMatch(type, userId) {
  const user = allResidents.find(u => u.id === userId);
  if (!user) return;

  if (type === 'comp') {
    document.getElementById('e-complainant_name').value    = user.full_name;
    document.getElementById('e-complainant_address').value = user.address_line || '';
    document.getElementById('e-complainant_contact').value = user.phone || '';
    document.getElementById('e-complainant_user_id').value = user.id;
    document.getElementById('e-complainant_email').value   = user.email || '';
    document.getElementById('comp-linked-name').textContent = `Linked: ${user.full_name}`;
    document.getElementById('comp-linked-badge').classList.remove('hidden');
    document.getElementById('comp-autocomplete').classList.add('hidden');
    if (user.purok_id && !document.getElementById('e-purok').value) {
      document.getElementById('e-purok').value = user.purok_id;
    }
  } else {
    document.getElementById('e-respondent_name').value    = user.full_name;
    document.getElementById('e-respondent_address').value = user.address_line || '';
    document.getElementById('e-respondent_contact').value = user.phone || '';
    document.getElementById('e-respondent_user_id').value = user.id;
    document.getElementById('resp-linked-name').textContent = `Linked: ${user.full_name}`;
    document.getElementById('resp-linked-badge').classList.remove('hidden');
    document.getElementById('resp-autocomplete').classList.add('hidden');
  }
}

function unlinkResident(type) {
  if (type === 'comp') {
    document.getElementById('e-complainant_user_id').value = '';
    document.getElementById('e-complainant_email').value = '';
    document.getElementById('comp-linked-badge').classList.add('hidden');
  } else {
    document.getElementById('e-respondent_user_id').value = '';
    document.getElementById('resp-linked-badge').classList.add('hidden');
  }
}

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
  allEntries = entries;

  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">No blotter entries found.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(b => `
    <tr class="table-row">
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${escapeHtml(b.entry_no)}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${escapeHtml(b.nature)}</td>
      <td class="px-4 py-3 text-sm text-gray-700">
        ${escapeHtml(b.complainant_name)}
        ${b.complainant_user_id ? '<span class="ml-1 text-[10px] text-blue-500" title="Linked Resident User"><i class="fa-solid fa-user-check"></i></span>' : ''}
      </td>
      <td class="px-4 py-3 text-sm text-gray-700">
        ${escapeHtml(b.respondent_name)}
        ${b.respondent_user_id ? '<span class="ml-1 text-[10px] text-purple-500" title="Linked Resident User"><i class="fa-solid fa-user-check"></i></span>' : ''}
      </td>
      <td class="px-4 py-3 text-sm text-gray-500">${escapeHtml(b.purok_name) || '—'}</td>
      <td class="px-4 py-3">${blotterStatusBadge(b.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(b.filed_at)}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <button onclick="openDetailModal(${b.id})" class="text-blue-600 hover:text-blue-800 text-sm p-1 transition-colors" title="View Details">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button onclick="openNotifyModal(${b.id})" class="text-amber-500 hover:text-amber-700 text-sm p-1 transition-colors" title="Send Notification to Complainant">
            <i class="fa-solid fa-bell"></i>
          </button>
          <button onclick="generateBlotterPDF(${b.id})" class="text-red-500 hover:text-red-700 text-sm p-1 transition-colors" title="Export Official PDF Report">
            <i class="fa-solid fa-file-pdf"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function openNewEntryModal() {
  document.getElementById('entry-form').reset();
  unlinkResident('comp');
  unlinkResident('resp');
  document.getElementById('comp-autocomplete').classList.add('hidden');
  document.getElementById('resp-autocomplete').classList.add('hidden');
  document.getElementById('new-entry-modal').classList.remove('hidden');
}

function closeNewEntryModal() { document.getElementById('new-entry-modal').classList.add('hidden'); }

async function handleEntrySubmit(e) {
  e.preventDefault();
  const complainant_name    = document.getElementById('e-complainant_name').value.trim();
  const complainant_address = document.getElementById('e-complainant_address').value.trim();
  const complainant_contact = document.getElementById('e-complainant_contact').value.trim();
  const respondent_name     = document.getElementById('e-respondent_name').value.trim();
  const nature              = document.getElementById('e-nature').value.trim();
  const narrative           = document.getElementById('e-narrative').value.trim();

  if (!complainant_name || !complainant_address || !complainant_contact || !respondent_name || !nature || !narrative) {
    showToast('Please fill in all required fields (Complainant Name, Address, Contact No., Respondent Name, Nature, and Narrative).', 'error');
    return;
  }

  const payload = {
    complainant_user_id: document.getElementById('e-complainant_user_id').value || null,
    complainant_name,
    complainant_email:   document.getElementById('e-complainant_email').value.trim() || null,
    complainant_address,
    complainant_contact,
    respondent_user_id:  document.getElementById('e-respondent_user_id').value || null,
    respondent_name,
    respondent_address:  document.getElementById('e-respondent_address').value.trim() || null,
    respondent_contact:  document.getElementById('e-respondent_contact').value.trim() || null,
    nature,
    narrative,
    purok_id: document.getElementById('e-purok').value || null,
  };

  const btn = document.getElementById('entry-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Filing…';

  const res = await api.post('/blotter', payload);

  btn.disabled = false;
  btn.textContent = 'File Entry';

  if (res && res.ok) {
    showToast('Blotter entry filed successfully');
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
  currentEntryData   = entry;
  currentEntryStatus = entry.status;

  document.getElementById('detail-entry-no').textContent = entry.entry_no;

  document.getElementById('detail-content').innerHTML = `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Nature of Complaint</span><p class="font-semibold">${escapeHtml(entry.nature)}</p></div>
      <div><span class="text-gray-500">Status</span><p>${blotterStatusBadge(entry.status)}</p></div>
      <div><span class="text-gray-500">Purok Location</span><p class="font-semibold">${escapeHtml(entry.purok_name) || '—'}</p></div>
      <div><span class="text-gray-500">Desk Officer</span><p class="font-semibold">${escapeHtml(entry.filed_by_name) || '—'}</p></div>

      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-500 text-xs uppercase font-semibold flex items-center justify-between">
          <span>Complainant Information</span>
          ${entry.complainant_user_id ? '<span class="text-[10px] text-blue-600 font-normal"><i class="fa-solid fa-user-check mr-1"></i>Verified Resident Account Linked</span>' : ''}
        </span>
        <p class="font-semibold text-gray-800 text-base mt-0.5">${escapeHtml(entry.complainant_name)}</p>
        <p class="text-xs text-gray-600 mt-0.5"><i class="fa-solid fa-location-dot mr-1 text-gray-400"></i>${escapeHtml(entry.complainant_address)}</p>
        <p class="text-xs text-gray-600 mt-0.5"><i class="fa-solid fa-phone mr-1 text-gray-400"></i>${escapeHtml(entry.complainant_contact)} ${entry.complainant_email || entry.complainant_linked_email ? ' · <i class="fa-solid fa-envelope mr-1 text-gray-400"></i>' + escapeHtml(entry.complainant_email || entry.complainant_linked_email) : ''}</p>
      </div>

      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-500 text-xs uppercase font-semibold flex items-center justify-between">
          <span>Respondent Information</span>
          ${entry.respondent_user_id ? '<span class="text-[10px] text-purple-600 font-normal"><i class="fa-solid fa-user-check mr-1"></i>Verified Resident Account Linked</span>' : ''}
        </span>
        <p class="font-semibold text-gray-800 text-base mt-0.5">${escapeHtml(entry.respondent_name)}</p>
        <p class="text-xs text-gray-600 mt-0.5"><i class="fa-solid fa-location-dot mr-1 text-gray-400"></i>${escapeHtml(entry.respondent_address) || 'No address provided'}</p>
        ${entry.respondent_contact ? `<p class="text-xs text-gray-600 mt-0.5"><i class="fa-solid fa-phone mr-1 text-gray-400"></i>${escapeHtml(entry.respondent_contact)}</p>` : ''}
      </div>

      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-500 font-medium">Facts of Complaint / Narrative</span>
        <p class="bg-gray-50 border border-gray-200/80 rounded-lg p-3 mt-1 text-gray-700 leading-relaxed whitespace-pre-line">${escapeHtml(entry.narrative)}</p>
      </div>

      ${entry.action_taken ? `
        <div class="col-span-2">
          <span class="text-gray-500 font-medium">Action Taken / Resolution Notes</span>
          <p class="bg-blue-50/60 border border-blue-100 rounded-lg p-3 mt-1 text-blue-900 leading-relaxed whitespace-pre-line">${escapeHtml(entry.action_taken)}</p>
        </div>` : ''}

      <div class="col-span-2 flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-3">
        <span>Filed: ${formatDate(entry.filed_at)}</span>
        ${entry.resolved_at ? `<span>Closed/Resolved: ${formatDate(entry.resolved_at)}</span>` : ''}
      </div>
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
            <span class="font-medium text-gray-700">${escapeHtml(l.action)}</span>
            ${l.note ? `<span class="text-gray-500"> — ${escapeHtml(l.note)}</span>` : ''}
            <span class="text-gray-400 block">${escapeHtml(l.actor_name) || 'System'} · ${formatDate(l.logged_at)}</span>
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
    showToast(`Status updated to "${pendingStatus}" and notification dispatched to complainant`);
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
  currentEntryData = null;
  cancelStatusChange();
}

// ── Notification Modal ──
async function openNotifyModal(id) {
  const entry = allEntries.find(e => e.id === id) || (currentEntryData?.id === id ? currentEntryData : null);
  document.getElementById('notify-entry-id').value = id;
  
  let targetInfo = 'Sending SMS and Email notice to complainant.';
  if (entry) {
    targetInfo = `Complainant: <strong>${escapeHtml(entry.complainant_name)}</strong> · Phone: <strong>${escapeHtml(entry.complainant_contact)}</strong> ${entry.complainant_email ? `· Email: <strong>${escapeHtml(entry.complainant_email)}</strong>` : ''}`;
  }
  document.getElementById('notify-target-info').innerHTML = targetInfo;
  document.getElementById('notify-custom-msg').value = '';
  document.getElementById('notify-modal').classList.remove('hidden');
}

function closeNotifyModal() {
  document.getElementById('notify-modal').classList.add('hidden');
}

async function handleNotifySubmit(e) {
  e.preventDefault();
  const id  = document.getElementById('notify-entry-id').value;
  const msg = document.getElementById('notify-custom-msg').value.trim();
  if (!msg) { showToast('Please enter a message or remarks to include.', 'error'); return; }

  const btn = document.getElementById('notify-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Sending…';

  const res = await api.post(`/blotter/${id}/notify`, { custom_message: msg });
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> Send Notification';

  if (res && res.ok) {
    const data = await res.json();
    showToast(data.message || 'Notification sent successfully');
    closeNotifyModal();
    if (currentEntryId === Number(id)) await openDetailModal(id);
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Failed to send notification', 'error');
  }
}

// ── Official Barangay Blotter Report PDF Export ──
function exportDetailToPDF() {
  if (currentEntryData) generateBlotterPDF(currentEntryData.id, currentEntryData);
}

async function generateBlotterPDF(id, cachedData = null) {
  let entry = cachedData;
  if (!entry) {
    const res = await api.get(`/blotter/${id}`);
    if (!res || !res.ok) { showToast('Could not load blotter entry for PDF export', 'error'); return; }
    entry = await res.json();
  }

  showToast('Generating official Blotter Report PDF…');

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // standard A4 px width
  container.style.background = '#ffffff';
  container.style.color = '#1a202c';
  container.style.fontFamily = "'Times New Roman', Times, serif";
  container.style.padding = '40px 50px';
  container.style.lineHeight = '1.4';

  const filedDate = entry.filed_at ? new Date(entry.filed_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const filedTime = entry.filed_at ? new Date(entry.filed_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';

  container.innerHTML = `
    <div style="text-align: center; border-bottom: 2px solid #2d3748; padding-bottom: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Republic of the Philippines</p>
      <p style="margin: 2px 0; font-size: 13px;">Province of Davao del Norte · City of Panabo</p>
      <h2 style="margin: 4px 0 2px 0; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #1a365d;">BARANGAY MANAY</h2>
      <p style="margin: 0; font-size: 12px; font-style: italic; color: #4a5568;">Office of the Lupong Tagapamayapa / Barangay Peace and Order Council</p>
      <h1 style="margin: 15px 0 0 0; font-size: 18px; font-weight: bold; text-transform: uppercase; text-decoration: underline; letter-spacing: 1.5px;">BARANGAY BLOTTER INCIDENT REPORT</h1>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px;">
      <tr>
        <td style="padding: 4px 0; width: 50%;"><strong>BLOTTER ENTRY NO:</strong> <span style="font-family: monospace; font-size: 14px; font-weight: bold; color: #2b6cb0;">${escapeHtml(entry.entry_no)}</span></td>
        <td style="padding: 4px 0; width: 50%; text-align: right;"><strong>DATE &amp; TIME FILED:</strong> ${filedDate} ${filedTime}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;"><strong>NATURE OF COMPLAINT:</strong> ${escapeHtml(entry.nature)}</td>
        <td style="padding: 4px 0; text-align: right;"><strong>STATUS:</strong> <span style="text-transform: uppercase; font-weight: bold;">${escapeHtml(entry.status)}</span></td>
      </tr>
      <tr>
        <td style="padding: 4px 0;" colspan="2"><strong>PUROK / LOCATION:</strong> ${escapeHtml(entry.purok_name || 'Barangay Manay')}</td>
      </tr>
    </table>

    <div style="border: 1px solid #cbd5e0; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; background: #f8fafc; font-size: 12px;">
      <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; color: #2c5282;">I. COMPLAINANT INFORMATION</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <p style="margin: 2px 0;"><strong>Full Name:</strong> ${escapeHtml(entry.complainant_name)}</p>
        <p style="margin: 2px 0;"><strong>Contact Number:</strong> ${escapeHtml(entry.complainant_contact || 'N/A')}</p>
        <p style="margin: 2px 0; grid-column: span 2;"><strong>Address:</strong> ${escapeHtml(entry.complainant_address || 'Barangay Manay, Panabo City')}</p>
        ${entry.complainant_email ? `<p style="margin: 2px 0; grid-column: span 2;"><strong>Email Address:</strong> ${escapeHtml(entry.complainant_email)}</p>` : ''}
      </div>
    </div>

    <div style="border: 1px solid #cbd5e0; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; background: #f8fafc; font-size: 12px;">
      <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; color: #2c5282;">II. RESPONDENT INFORMATION</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
        <p style="margin: 2px 0;"><strong>Full Name:</strong> ${escapeHtml(entry.respondent_name)}</p>
        <p style="margin: 2px 0;"><strong>Contact Number:</strong> ${escapeHtml(entry.respondent_contact || 'N/A')}</p>
        <p style="margin: 2px 0; grid-column: span 2;"><strong>Address:</strong> ${escapeHtml(entry.respondent_address || 'Barangay Manay, Panabo City')}</p>
      </div>
    </div>

    <div style="border: 1px solid #cbd5e0; border-radius: 4px; padding: 12px 14px; margin-bottom: 14px; font-size: 12px;">
      <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; color: #2c5282;">III. FACTS OF THE COMPLAINT / INCIDENT NARRATIVE</p>
      <p style="margin: 6px 0 0 0; text-align: justify; white-space: pre-line; line-height: 1.6;">${escapeHtml(entry.narrative)}</p>
    </div>

    ${entry.action_taken ? `
      <div style="border: 1px solid #cbd5e0; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; background: #f0fdf4; font-size: 12px;">
        <p style="margin: 0 0 6px 0; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #bbf7d0; padding-bottom: 3px; color: #166534;">IV. ACTION TAKEN / MEDIATION RESOLUTION / REMARKS</p>
        <p style="margin: 6px 0 0 0; white-space: pre-line; line-height: 1.5; color: #14532d;">${escapeHtml(entry.action_taken)}</p>
      </div>` : ''}

    <div style="margin-top: 35px; font-size: 12px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
            <p style="margin-bottom: 40px;">Certified correct by Complainant:</p>
            <p style="border-top: 1px solid #000; width: 85%; text-align: center; margin: 0; padding-top: 4px; font-weight: bold;">
              ${escapeHtml(entry.complainant_name)}
            </p>
            <p style="text-align: center; width: 85%; margin: 2px 0 0 0; font-size: 11px; color: #718096;">Complainant Signature Over Printed Name</p>
          </td>
          <td style="width: 50%; vertical-align: top; padding-left: 20px;">
            <p style="margin-bottom: 40px;">Recorded / Filed by:</p>
            <p style="border-top: 1px solid #000; width: 85%; text-align: center; margin: 0; padding-top: 4px; font-weight: bold;">
              ${escapeHtml(entry.filed_by_name || 'Barangay Desk Officer')}
            </p>
            <p style="text-align: center; width: 85%; margin: 2px 0 0 0; font-size: 11px; color: #718096;">Duty Officer / Administrator</p>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="text-align: center; padding-top: 40px;">
            <p style="margin-bottom: 40px;">Attested &amp; Approved by:</p>
            <p style="border-top: 1px solid #000; width: 45%; margin: auto; padding-top: 4px; font-weight: bold; text-transform: uppercase;">
              HON. PUNONG BARANGAY
            </p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #718096;">Punong Barangay / Lupon Chairman</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 30px; border-top: 1px dashed #cbd5e0; padding-top: 8px; text-align: center; font-size: 10px; color: #a0aec0;">
      ResQTrack Digital Blotter Record Management System · Official Copy · Barangay Manay, Panabo City, Davao del Norte
    </div>
  `;

  document.body.appendChild(container);

  if (typeof html2pdf !== 'undefined') {
    const opt = {
      margin:       10,
      filename:     `Blotter_Report_${entry.entry_no}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      await html2pdf().set(opt).from(container).save();
      showToast('PDF downloaded successfully');
    } catch (err) {
      console.error('html2pdf export error:', err);
      window.print();
    } finally {
      container.remove();
    }
  } else {
    window.print();
    container.remove();
  }
}

