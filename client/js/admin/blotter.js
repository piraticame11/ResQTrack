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
let activePreviewEntry = null;

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

  // Radio listener for incident type "Others"
  const typeRadios = document.querySelectorAll('input[name="incident_type"]');
  const typeOtherInput = document.getElementById('e-incident_type_other');
  if (typeRadios && typeOtherInput) {
    typeRadios.forEach(r => {
      r.addEventListener('change', () => {
        if (document.getElementById('type-others-radio')?.checked) {
          typeOtherInput.disabled = false;
          typeOtherInput.focus();
        } else {
          typeOtherInput.disabled = true;
          typeOtherInput.value = '';
        }
      });
    });
  }

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

  let calculatedAge = '';
  if (user.birthdate) {
    const diff = new Date() - new Date(user.birthdate);
    const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    if (!isNaN(age) && age > 0) calculatedAge = age;
  }

  if (type === 'comp') {
    document.getElementById('e-complainant_name').value    = user.full_name;
    document.getElementById('e-complainant_address').value = user.address_line || '';
    document.getElementById('e-complainant_contact').value = user.phone || '';
    document.getElementById('e-complainant_user_id').value = user.id;
    document.getElementById('e-complainant_email').value   = user.email || '';
    if (calculatedAge) document.getElementById('e-complainant_age').value = calculatedAge;
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
    if (calculatedAge) document.getElementById('e-respondent_age').value = calculatedAge;
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
      <td class="px-4 py-3 text-sm text-gray-700">${escapeHtml(b.incident_type || b.nature)}</td>
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
          <button onclick="openBlotterPdfPreview(${b.id})" class="text-red-500 hover:text-red-700 text-sm p-1 transition-colors" title="Preview & Export Official PDF Report">
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

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  document.getElementById('e-incident_date').value = today;
  document.getElementById('e-incident_time').value = now;

  const user = (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
  const prepEl = document.getElementById('e-prepared_by');
  if (prepEl) prepEl.value = user?.name || user?.full_name || 'Barangay Desk Officer';
  const notedEl = document.getElementById('e-noted_by');
  if (notedEl && !notedEl.value) notedEl.value = 'HON. PUNONG BARANGAY';

  const typeOtherInput = document.getElementById('e-incident_type_other');
  if (typeOtherInput) typeOtherInput.disabled = true;

  document.getElementById('new-entry-modal').classList.remove('hidden');
}

function closeNewEntryModal() { document.getElementById('new-entry-modal').classList.add('hidden'); }

async function handleEntrySubmit(e) {
  e.preventDefault();
  const complainant_name        = document.getElementById('e-complainant_name').value.trim();
  const complainant_age         = document.getElementById('e-complainant_age').value.trim();
  const complainant_sex         = document.getElementById('e-complainant_sex').value.trim();
  const complainant_address     = document.getElementById('e-complainant_address').value.trim();
  const complainant_contact     = document.getElementById('e-complainant_contact').value.trim();
  const complainant_occupation  = document.getElementById('e-complainant_occupation').value.trim();
  const complainant_civil_status = document.getElementById('e-complainant_civil_status').value.trim();

  const respondent_name         = document.getElementById('e-respondent_name').value.trim();
  const respondent_age          = document.getElementById('e-respondent_age').value.trim();
  const respondent_sex          = document.getElementById('e-respondent_sex').value.trim();
  const respondent_address      = document.getElementById('e-respondent_address').value.trim();
  const respondent_contact      = document.getElementById('e-respondent_contact').value.trim();
  const respondent_occupation   = document.getElementById('e-respondent_occupation').value.trim();
  const respondent_civil_status = document.getElementById('e-respondent_civil_status').value.trim();

  const incident_date           = document.getElementById('e-incident_date').value.trim();
  const incident_time           = document.getElementById('e-incident_time').value.trim();
  const incident_place          = document.getElementById('e-incident_place').value.trim();

  const selectedTypeRadio       = document.querySelector('input[name="incident_type"]:checked');
  let incident_type             = selectedTypeRadio ? selectedTypeRadio.value : '';
  if (incident_type === 'Others') {
    const otherVal = document.getElementById('e-incident_type_other').value.trim();
    incident_type = otherVal ? `Others (${otherVal})` : 'Others';
  }

  const narrative               = document.getElementById('e-narrative').value.trim();
  const action_taken            = document.getElementById('e-action_taken').value.trim();

  // Attachments
  const attachList = [];
  if (document.getElementById('attach-photos')?.checked)    attachList.push('Photo/s');
  if (document.getElementById('attach-videos')?.checked)    attachList.push('Video/s');
  if (document.getElementById('attach-documents')?.checked) attachList.push('Document/s');
  if (document.getElementById('attach-others')?.checked)    attachList.push('Others');
  const attachNote = document.getElementById('e-attachments_note')?.value.trim();
  const attachments = attachList.length ? (attachNote ? `${attachList.join(', ')} - ${attachNote}` : attachList.join(', ')) : (attachNote || null);

  const noted_by = document.getElementById('e-noted_by')?.value.trim() || 'HON. PUNONG BARANGAY';

  if (!complainant_name || !complainant_address || !complainant_contact || !respondent_name || !incident_type || !narrative) {
    showToast('Please fill in all required fields (Complainant Name, Address, Contact No., Respondent Name, Incident Type, and Narrative).', 'error');
    return;
  }

  const payload = {
    complainant_user_id: document.getElementById('e-complainant_user_id').value || null,
    complainant_name,
    complainant_age:     complainant_age ? parseInt(complainant_age, 10) : null,
    complainant_sex:     complainant_sex || null,
    complainant_email:   document.getElementById('e-complainant_email').value.trim() || null,
    complainant_address,
    complainant_contact,
    complainant_occupation: complainant_occupation || null,
    complainant_civil_status: complainant_civil_status || null,

    respondent_user_id:  document.getElementById('e-respondent_user_id').value || null,
    respondent_name,
    respondent_age:      respondent_age ? parseInt(respondent_age, 10) : null,
    respondent_sex:      respondent_sex || null,
    respondent_address:  respondent_address || null,
    respondent_contact:  respondent_contact || null,
    respondent_occupation: respondent_occupation || null,
    respondent_civil_status: respondent_civil_status || null,

    incident_date:       incident_date || null,
    incident_time:       incident_time || null,
    incident_place:      incident_place || null,
    incident_type,
    nature:              incident_type,
    narrative,
    action_taken:        action_taken || null,
    attachments,
    noted_by,
    purok_id: document.getElementById('e-purok').value || null,
  };

  const btn = document.getElementById('entry-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Filing…';

  const res = await api.post('/blotter', payload);

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1.5"></i> File Blotter Entry';

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
      <div><span class="text-gray-500 text-xs">Type / Nature</span><p class="font-semibold text-gray-800">${escapeHtml(entry.incident_type || entry.nature)}</p></div>
      <div><span class="text-gray-500 text-xs">Status</span><p>${blotterStatusBadge(entry.status)}</p></div>
      <div><span class="text-gray-500 text-xs">Incident Date &amp; Time</span><p class="font-semibold text-gray-800">${entry.incident_date ? formatDate(entry.incident_date) : '—'} ${entry.incident_time ? 'at ' + escapeHtml(entry.incident_time) : ''}</p></div>
      <div><span class="text-gray-500 text-xs">Place of Incident</span><p class="font-semibold text-gray-800">${escapeHtml(entry.incident_place || entry.purok_name) || '—'}</p></div>
      <div><span class="text-gray-500 text-xs">Desk Officer (Prepared by)</span><p class="font-semibold text-gray-800">${escapeHtml(entry.filed_by_name) || '—'}</p></div>
      <div><span class="text-gray-500 text-xs">Noted by</span><p class="font-semibold text-gray-800">${escapeHtml(entry.noted_by) || 'HON. PUNONG BARANGAY'}</p></div>

      <!-- Section I: Complainant -->
      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-500 text-xs uppercase font-bold flex items-center justify-between text-blue-700">
          <span>I. Complainant / Reporting Party</span>
          ${entry.complainant_user_id ? '<span class="text-[10px] text-blue-600 font-normal"><i class="fa-solid fa-user-check mr-1"></i>Verified Resident Account</span>' : ''}
        </span>
        <p class="font-semibold text-gray-800 text-base mt-0.5">${escapeHtml(entry.complainant_name)}</p>
        <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-1">
          <p><strong>Age:</strong> ${entry.complainant_age || 'N/A'} · <strong>Sex:</strong> ${escapeHtml(entry.complainant_sex || 'N/A')}</p>
          <p><strong>Civil Status:</strong> ${escapeHtml(entry.complainant_civil_status || 'N/A')} · <strong>Occupation:</strong> ${escapeHtml(entry.complainant_occupation || 'N/A')}</p>
          <p class="col-span-2"><i class="fa-solid fa-location-dot mr-1 text-gray-400"></i>${escapeHtml(entry.complainant_address)}</p>
          <p class="col-span-2"><i class="fa-solid fa-phone mr-1 text-gray-400"></i>${escapeHtml(entry.complainant_contact)} ${entry.complainant_email || entry.complainant_linked_email ? ' · <i class="fa-solid fa-envelope mr-1 text-gray-400"></i>' + escapeHtml(entry.complainant_email || entry.complainant_linked_email) : ''}</p>
        </div>
      </div>

      <!-- Section II: Respondent -->
      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-500 text-xs uppercase font-bold flex items-center justify-between text-purple-700">
          <span>II. Respondent / Person Involved</span>
          ${entry.respondent_user_id ? '<span class="text-[10px] text-purple-600 font-normal"><i class="fa-solid fa-user-check mr-1"></i>Verified Resident Account</span>' : ''}
        </span>
        <p class="font-semibold text-gray-800 text-base mt-0.5">${escapeHtml(entry.respondent_name)}</p>
        <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-1">
          <p><strong>Age:</strong> ${entry.respondent_age || 'N/A'} · <strong>Sex:</strong> ${escapeHtml(entry.respondent_sex || 'N/A')}</p>
          <p><strong>Civil Status:</strong> ${escapeHtml(entry.respondent_civil_status || 'N/A')} · <strong>Occupation:</strong> ${escapeHtml(entry.respondent_occupation || 'N/A')}</p>
          <p class="col-span-2"><i class="fa-solid fa-location-dot mr-1 text-gray-400"></i>${escapeHtml(entry.respondent_address) || 'No address provided'}</p>
          ${entry.respondent_contact ? `<p class="col-span-2"><i class="fa-solid fa-phone mr-1 text-gray-400"></i>${escapeHtml(entry.respondent_contact)}</p>` : ''}
        </div>
      </div>

      <!-- Section IV: Narrative -->
      <div class="col-span-2 border-t border-gray-100 pt-3">
        <span class="text-gray-700 font-semibold text-xs uppercase">IV. Incident Narrative</span>
        <p class="bg-gray-50 border border-gray-200/80 rounded-lg p-3 mt-1 text-gray-700 leading-relaxed whitespace-pre-line text-xs font-mono">${escapeHtml(entry.narrative)}</p>
      </div>

      <!-- Section V: Action Taken -->
      ${entry.action_taken ? `
        <div class="col-span-2">
          <span class="text-gray-700 font-semibold text-xs uppercase">V. Action Taken / Remarks</span>
          <p class="bg-blue-50/60 border border-blue-100 rounded-lg p-3 mt-1 text-blue-900 leading-relaxed whitespace-pre-line text-xs">${escapeHtml(entry.action_taken)}</p>
        </div>` : ''}

      <!-- Section VI: Attachments -->
      ${entry.attachments ? `
        <div class="col-span-2 text-xs text-gray-600">
          <span class="font-semibold text-gray-700 uppercase">VI. Attachments:</span> ${escapeHtml(entry.attachments)}
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

// ── Official Barangay Blotter Report PDF Preview & Export ──
let activePdfBlobUrl = null;

function exportDetailToPDF() {
  if (currentEntryData) openBlotterPdfPreview(currentEntryData.id, currentEntryData);
}

async function openBlotterPdfPreview(id, cachedData = null) {
  let entry = cachedData;
  activePreviewEntry = entry;

  const modal = document.getElementById('pdf-preview-modal');
  const canvas = document.getElementById('pdf-preview-canvas');
  modal.classList.remove('hidden');

  // Loading state
  canvas.innerHTML = `
    <div class="flex flex-col items-center justify-center py-24 text-slate-300">
      <i class="fa-solid fa-circle-notch fa-spin text-4xl text-blue-500 mb-3"></i>
      <p class="font-medium text-sm">Generating Official Blotter PDF from template…</p>
      <p class="text-xs text-slate-500 mt-1">Populating official barangay form inputs with complaint record data</p>
    </div>
  `;

  try {
    const res = await api.get(`/blotter/${id}/pdf`);
    if (!res || !res.ok) {
      canvas.innerHTML = `
        <div class="p-8 text-center text-red-400">
          <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
          <p class="font-semibold">Failed to generate official blotter PDF.</p>
          <p class="text-xs text-slate-400 mt-1">Please try again or contact system support.</p>
        </div>
      `;
      showToast('Could not load official blotter PDF', 'error');
      return;
    }

    const blob = await res.blob();
    if (activePdfBlobUrl) {
      URL.revokeObjectURL(activePdfBlobUrl);
    }
    activePdfBlobUrl = URL.createObjectURL(blob);

    if (!activePreviewEntry) {
      activePreviewEntry = allEntries.find(b => b.id === id) || { id, entry_no: `BLT-${id}` };
    }

    canvas.innerHTML = `
      <div class="w-full h-full flex flex-col flex-1 min-h-[70vh]">
        <iframe id="pdf-preview-frame" src="${activePdfBlobUrl}#toolbar=0&navpanes=0" class="w-full flex-1 min-h-[72vh] rounded-lg border border-slate-700 shadow-xl bg-white" title="Official Blotter Document"></iframe>
        <div class="mt-2 text-center text-xs text-slate-400">
          Official Barangay Blotter Document · Exact base template filled with complaint record details
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error generating blotter PDF preview:', err);
    canvas.innerHTML = `<div class="p-8 text-center text-red-400">Error: ${escapeHtml(err.message)}</div>`;
  }
}

function closePdfPreviewModal() {
  document.getElementById('pdf-preview-modal').classList.add('hidden');
}

function openPdfNewTab() {
  if (activePdfBlobUrl) {
    window.open(activePdfBlobUrl, '_blank');
  } else if (activePreviewEntry) {
    const token = typeof getToken === 'function' ? getToken() : '';
    window.open(`/api/blotter/${activePreviewEntry.id}/pdf?token=${encodeURIComponent(token)}`, '_blank');
  }
}

function downloadActivePdf() {
  if (!activePreviewEntry) return;
  const fileName = `Barangay_Blotter_${activePreviewEntry.entry_no || 'Document'}.pdf`;

  if (activePdfBlobUrl) {
    const a = document.createElement('a');
    a.href = activePdfBlobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Official Blotter PDF downloaded');
  } else {
    const token = typeof getToken === 'function' ? getToken() : '';
    window.location.href = `/api/blotter/${activePreviewEntry.id}/pdf?token=${encodeURIComponent(token)}`;
  }
}

function printActivePdf() {
  const frame = document.getElementById('pdf-preview-frame');
  if (frame && frame.contentWindow) {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    } catch (e) {
      console.warn('Iframe print failed, falling back:', e);
    }
  }
  if (activePdfBlobUrl) {
    const printWin = window.open(activePdfBlobUrl, '_blank');
    if (printWin) {
      printWin.focus();
      setTimeout(() => { try { printWin.print(); } catch (_) {} }, 500);
    }
  }
}
