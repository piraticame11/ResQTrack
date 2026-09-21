let currentIncidentId      = null;
let currentIncidentPurokId = null;

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  await populatePurokSelect(document.getElementById('filter-purok'), { placeholder: 'All Puroks' });

  document.getElementById('filter-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadIncidents(); });

  await loadIncidents();

  // Uses the shared socket created by notify.js (sound + notification already handled there)
  const socket = window._adminSocket;
  socket.on('incident:new',           () => loadIncidents());
  socket.on('incident:status_update', () => loadIncidents());
})();

async function loadIncidents() {
  const status = document.getElementById('filter-status').value;
  const type   = document.getElementById('filter-type').value;
  const purok  = document.getElementById('filter-purok').value;
  const search = document.getElementById('filter-search').value.trim();

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (type)   params.append('incident_type', type);
  if (purok)  params.append('purok_id', purok);
  if (search) params.append('search', search);

  const tbody = document.getElementById('incidents-body');
  tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">Loading…</td></tr>`;

  const res = await api.get(`/incidents?${params}`);
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-red-400">Failed to load incidents.</td></tr>`;
    return;
  }
  const incidents = await res.json();
  document.getElementById('total-count').textContent = `${incidents.length} incident(s) found`;

  if (!incidents.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">No incidents match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = incidents.map(i => `
    <tr class="table-row">
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${i.reporter_name || '—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3">
        <button onclick="openIncidentModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">
          <i class="fa-solid fa-eye"></i> View
        </button>
        ${(i.status === 'Pending' || i.status === 'Assigned')
          ? `<button onclick="openAssignModal(${i.id}, ${i.purok_id || 0})" class="text-green-600 hover:text-green-800 text-xs font-medium mr-2">
               <i class="fa-solid fa-user-plus"></i> Assign
             </button>`
          : ''}
        ${(i.status === 'Initiate' || i.status === 'Delayed')
          ? `<button onclick="askUpdate(${i.id})" class="text-amber-600 hover:text-amber-800 text-xs font-medium" title="Ask Update via SMS">
               <i class="fa-solid fa-comment-sms"></i> Ask Update
             </button>`
          : ''}
      </td>
    </tr>`).join('');
}

async function askUpdate(id) {
  const res = await api.post(`/incidents/${id}/ask-update`, {});
  if (res && res.ok) {
    const data = await res.json();
    showToast(data.message || 'Status update request sent via SMS to assigned responder(s).');
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to send update request.', 'error');
  }
}

async function openIncidentModal(id) {
  currentIncidentId = id;
  document.getElementById('incident-modal').classList.remove('hidden');

  const [iRes, lRes] = await Promise.all([api.get(`/incidents/${id}`), api.get(`/incidents/${id}/logs`)]);
  const inc  = iRes && iRes.ok ? await iRes.json() : null;
  const logs = lRes && lRes.ok ? await lRes.json() : [];

  if (!inc) return;

  currentIncidentPurokId = inc.purok_id;
  document.getElementById('modal-ref').textContent = inc.reference_no;

  const photos = inc.attachments?.length ? inc.attachments.map(a => a.file_path) : (inc.photo_path ? [inc.photo_path] : []);
  const photoHtml = photos.length
    ? `<div class="grid grid-cols-3 gap-2">${photos.map(p => `<a href="${p}" target="_blank" rel="noopener"><img src="${p}" class="w-full h-24 object-cover rounded-lg border border-gray-200"></a>`).join('')}</div>`
    : `<p class="text-gray-400 text-sm italic">No photo uploaded</p>`;

  const isAdmin = getUser()?.role === 'admin';

  const fakeBanner = inc.is_fake
    ? `<div class="col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
         <i class="fa-solid fa-flag mr-1"></i> Flagged as a fake report by ${inc.flagged_by_name || 'a responder'}: ${inc.fake_reason || ''}
       </div>`
    : '';

  const PRIORITY_OPTIONS = [
    { value: 'Red',    label: 'Critical (Red)' },
    { value: 'Orange', label: 'High (Orange)' },
    { value: 'Yellow', label: 'Moderate (Yellow)' },
    { value: 'Green',  label: 'Low (Green)' },
  ];

  const reclassifyHtml = isAdmin ? `
    <div class="col-span-2 border-t pt-3 mt-1">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Admin Override</p>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Category / Type</label>
          <select id="reclass-type" class="input-field text-sm" data-orig-type="${inc.incident_type}">
            ${['Fire','Rescue','Crime','Fights','Flood','Missing','Noise','Other'].map(t => `<option ${t === inc.incident_type ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Priority Level</label>
          <select id="reclass-triage" class="input-field text-sm" data-orig-triage="${inc.triage_color}">
            ${PRIORITY_OPTIONS.map(p => `<option value="${p.value}" ${p.value === inc.triage_color ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <button onclick="submitReclassify(${id})" class="btn-secondary btn-sm mt-2.5 w-full">
        <i class="fa-solid fa-rotate mr-1"></i> Save Category / Priority
      </button>
    </div>` : '';

  // Check potential duplicates/spam in same vicinity
  const dupeRes = await api.get(`/incidents/${id}/duplicates`).catch(() => null);
  const dupes = dupeRes && dupeRes.ok ? await dupeRes.json() : [];

  const dupeBanner = dupes.length ? `
    <div class="col-span-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs">
      <div class="flex items-center justify-between font-bold mb-1">
        <span><i class="fa-solid fa-triangle-exclamation text-amber-500 mr-1.5"></i>Vicinity Cluster: ${dupes.length} other report(s) in same purok/timeframe</span>
      </div>
      <div class="space-y-1.5 mt-2">
        ${dupes.map(d => `
          <div class="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200 gap-2">
            <div class="min-w-0">
              <span class="font-mono font-semibold text-gray-800">${d.reference_no}</span>
              <span class="text-gray-500"> · ${d.incident_type} (${statusBadge(d.status)})</span>
              <p class="text-gray-400 truncate text-[11px]">${d.description || 'No description'}</p>
            </div>
            <button type="button" onclick="promptFlagSpam(${id}, ${d.id})" class="btn-warning btn-sm text-xs shrink-0">
              Mark as Duplicate
            </button>
          </div>
        `).join('')}
      </div>
    </div>` : '';

  const spamBanner = inc.is_spam ? `
    <div class="col-span-2 bg-gray-100 border border-gray-300 text-gray-700 rounded-lg px-3 py-2 text-xs">
      <i class="fa-solid fa-ban text-gray-500 mr-1"></i> Marked as Spam/Duplicate: ${inc.spam_reason || 'Duplicate report in same area.'}
    </div>` : '';

  const respondersDisplay = inc.all_responder_names || inc.responder_name || 'None assigned';

  document.getElementById('modal-content').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left Column: Details, Description, Admin overrides (7 cols) -->
      <div class="lg:col-span-7 space-y-4">
        ${fakeBanner}
        ${spamBanner}
        ${dupeBanner}
        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-4">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-info text-blue-500"></i> Incident Overview
          </h4>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-400 text-xs font-medium">Triage Priority</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Incident Type</span><p class="font-semibold"><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
            <div><span class="text-gray-400 text-xs font-medium">Purok</span><p class="font-semibold text-gray-800">${inc.purok_name || '—'}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Reporter</span><p class="font-semibold text-gray-800">${inc.reporter_name}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Reported At</span><p class="font-medium text-gray-700 text-xs mt-0.5">${formatDate(inc.reported_at)}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Current Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
            <div class="col-span-2 pt-2 border-t border-gray-200/80">
              <span class="text-gray-400 text-xs font-medium">Assigned Responder(s)</span>
              <p class="font-semibold text-blue-700 mt-0.5 flex items-center gap-1.5"><i class="fa-solid fa-user-shield text-blue-500"></i> ${respondersDisplay}</p>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block mb-1">Description / Narrative</span>
          <p class="text-gray-700 text-sm whitespace-pre-line leading-relaxed">${inc.description}</p>
        </div>
        ${reclassifyHtml}
      </div>

      <!-- Right Column: Location, Photos, Activity Log (5 cols) -->
      <div class="lg:col-span-5 space-y-4">
        ${inc.latitude ? `
        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider"><i class="fa-solid fa-location-dot text-red-500 mr-1"></i> Location Coordinates</span>
            <a href="https://www.google.com/maps?q=${inc.latitude},${inc.longitude}" target="_blank" rel="noopener" class="text-blue-600 text-xs hover:underline flex items-center gap-1 font-medium"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open in Maps</a>
          </div>
          <p class="font-mono text-xs text-gray-700 bg-white p-2 rounded-lg border border-gray-200">${inc.latitude}, ${inc.longitude}</p>
        </div>` : ''}

        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-2">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block"><i class="fa-solid fa-camera text-blue-500 mr-1"></i> Attached Evidence / Photos</span>
          ${photoHtml}
        </div>

        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-2">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block"><i class="fa-solid fa-clock-rotate-left text-indigo-500 mr-1"></i> Activity History</span>
          <div class="space-y-2 max-h-52 overflow-y-auto pr-1">
            ${logs.length ? logs.map(l => `
              <div class="flex gap-2.5 text-xs bg-white p-2.5 rounded-lg border border-gray-100">
                <div class="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0"></div>
                <div class="flex-1 min-w-0">
                  <span class="font-semibold text-gray-800">${l.action}</span>
                  ${l.note ? `<span class="text-gray-500 block text-[11px] mt-0.5"> — ${l.note}</span>` : ''}
                  <span class="text-gray-400 text-[10px] block mt-0.5">${l.actor_name || 'System'} · ${formatDate(l.logged_at)}</span>
                </div>
              </div>`).join('') : '<p class="text-gray-400 text-xs">No activity recorded yet.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  const actionsDiv = document.getElementById('modal-actions');
  let html = '';

  if (inc.status === 'Pending') {
    html += `<button onclick="closeModal(); openAssignModal(${id}, ${inc.purok_id || 0})" class="btn-primary btn-sm">
               <i class="fa-solid fa-user-plus mr-1"></i> Assign Responders
             </button>`;
  } else if (inc.status === 'Assigned') {
    html += `<button onclick="closeModal(); openAssignModal(${id}, ${inc.purok_id || 0})" class="btn-secondary btn-sm">
               <i class="fa-solid fa-user-pen mr-1"></i> Manage Responders
             </button>`;
  }

  if (inc.status === 'Initiate' || inc.status === 'Delayed') {
    html += `<button onclick="askUpdate(${id})" class="btn-secondary btn-sm text-amber-700 border-amber-300 hover:bg-amber-50">
               <i class="fa-solid fa-comment-sms mr-1"></i> Ask Update (SMS)
             </button>`;
  }

  (INCIDENT_TRANSITIONS[inc.status] || []).forEach(s => {
    const icon = STATUS_ACTION_ICON[s] || 'fa-arrow-right';
    html += s === 'Delayed'
      ? `<button onclick="promptDelayReason(${id})" class="btn-warning btn-sm"><i class="fa-solid ${icon} mr-1"></i> Delayed</button>`
      : `<button onclick="changeStatus(${id},'${s}')" class="btn-primary btn-sm"><i class="fa-solid ${icon} mr-1"></i> ${s}</button>`;
  });

  if (!inc.is_fake && !inc.is_spam) {
    html += `<button onclick="promptFlagSpam(${id})" class="text-xs text-amber-600 hover:underline">
               <i class="fa-solid fa-ban mr-1"></i> Flag as Spam
             </button>`;
    html += `<button onclick="promptFlagFake(${id})" class="text-xs text-red-500 hover:underline">
               <i class="fa-solid fa-flag mr-1"></i> Flag as Fake
             </button>`;
  } else if (inc.is_fake && isAdmin) {
    html += `<button onclick="unflagIncident(${id})" class="text-xs text-gray-500 hover:underline">Remove Fake Flag</button>`;
  }

  html += `<button onclick="closeModal()" class="btn-secondary btn-sm ml-auto">Close</button>`;
  actionsDiv.innerHTML = html;
}

function promptFlagSpam(id, duplicateOfId = null) {
  const promptMsg = duplicateOfId
    ? `Why is this report being marked as a duplicate of incident #${duplicateOfId}?`
    : 'Why is this report being marked as spam / duplicate?';
  openReasonModal(promptMsg, reason => flagSpam(id, reason, duplicateOfId));
}

async function flagSpam(id, reason, duplicateOfId) {
  const res = await api.patch(`/incidents/${id}/flag-spam`, { reason, duplicate_of_id: duplicateOfId });
  if (res && res.ok) {
    showToast('Incident flagged as spam/duplicate and archived');
    closeModal();
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to flag incident as spam', 'error');
  }
}

function promptDelayReason(id) {
  openReasonModal('Why is this incident delayed?', reason => changeStatus(id, 'Delayed', reason));
}

async function changeStatus(id, status, note) {
  const res = await api.patch(`/incidents/${id}/status`, note ? { status, note } : { status });
  if (res && res.ok) {
    showToast(`Status updated to ${status}`);
    closeModal();
    loadIncidents();
  } else {
    showToast('Failed to update status', 'error');
  }
}

async function submitReclassify(id) {
  const typeEl   = document.getElementById('reclass-type');
  const triageEl = document.getElementById('reclass-triage');
  const incident_type = typeEl.value;
  const triage_color  = triageEl.value;
  const orig_type   = typeEl.getAttribute('data-orig-type');
  const orig_triage = triageEl.getAttribute('data-orig-triage');

  if (incident_type === orig_type && triage_color === orig_triage) {
    // No changes were made — ignore
    return;
  }

  const PRIORITY_LABELS = {
    Red:    'Critical (Red)',
    Orange: 'High (Orange)',
    Yellow: 'Moderate (Yellow)',
    Green:  'Low (Green)',
  };

  const origTriageLabel = PRIORITY_LABELS[orig_triage] || orig_triage;
  const newTriageLabel  = PRIORITY_LABELS[triage_color] || triage_color;

  const changes = [];
  if (incident_type !== orig_type) changes.push(`Category: ${orig_type} → ${incident_type}`);
  if (triage_color !== orig_triage) changes.push(`Priority: ${origTriageLabel} → ${newTriageLabel}`);

  if (!confirm(`Confirm administrative override:\n\n• ${changes.join('\n• ')}\n\nApply these changes?`)) {
    return;
  }

  const res = await api.patch(`/incidents/${id}/reclassify`, { incident_type, triage_color });
  if (res && res.ok) {
    showToast('Incident category / priority updated');
    openIncidentModal(id);
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to update incident', 'error');
  }
}

function promptFlagFake(id) {
  openReasonModal('Why is this being flagged as a fake report? (This will archive the report)', reason => flagFake(id, reason));
}

async function flagFake(id, reason) {
  const res = await api.patch(`/incidents/${id}/flag-fake`, { reason });
  if (res && res.ok) {
    showToast('Incident flagged as fake and archived');
    closeModal();
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to flag incident', 'error');
  }
}

async function unflagIncident(id) {
  const res = await api.patch(`/incidents/${id}/unflag-fake`, {});
  if (res && res.ok) {
    showToast('Fake flag removed');
    openIncidentModal(id);
    loadIncidents();
  } else {
    showToast('Failed to remove flag', 'error');
  }
}

// ── Assign Modal ─────────────────────────────────────────────────────────────
let _assignRespondersList = [];
let _assignIncidentPurokId = null;
let _assignExistingIds = [];

async function openAssignModal(id, purokId) {
  currentIncidentId = id;
  _assignIncidentPurokId = purokId || 0;
  document.getElementById('assign-modal').classList.remove('hidden');

  document.getElementById('responder-list').innerHTML =
    '<div class="px-4 py-6 text-center text-gray-400 text-sm">Loading responders…</div>';
  document.getElementById('selected-count').textContent = '0 selected';
  if (document.getElementById('assign-responder-search')) {
    document.getElementById('assign-responder-search').value = '';
  }

  let existingIds = [];
  let resolvedPurokId = purokId || 0;
  const iRes = await api.get(`/incidents/${id}`);
  if (iRes && iRes.ok) {
    const inc = await iRes.json();
    if (inc.all_responder_ids) {
      existingIds = inc.all_responder_ids.split(',').map(Number).filter(Boolean);
    } else if (inc.assigned_responder_id) {
      existingIds = [inc.assigned_responder_id];
    }
    if (!resolvedPurokId) resolvedPurokId = inc.purok_id || 0;
  }

  _assignExistingIds = existingIds;
  _assignIncidentPurokId = resolvedPurokId;
  await loadRespondersForAssign(resolvedPurokId, existingIds);
}

async function loadRespondersForAssign(incidentPurokId, existingIds = []) {
  const container = document.getElementById('responder-list');

  const res = await api.get('/admin/users?role=responder');
  if (!res || !res.ok) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-red-400 text-sm">Failed to load responders.</div>';
    return;
  }

  const all = (await res.json()).filter(r => r.is_active);
  _assignRespondersList = all;

  renderAssignResponderList(all, incidentPurokId, existingIds);
}

function renderAssignResponderList(all, incidentPurokId, existingIds = []) {
  const container = document.getElementById('responder-list');
  if (!all.length) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-gray-400 text-sm">No active responders match.</div>';
    return;
  }

  const same   = all.filter(r => incidentPurokId && r.purok_id == incidentPurokId);
  const others = all.filter(r => !incidentPurokId || r.purok_id != incidentPurokId);

  const makeItem = (r, isSamePurok) => `
    <label class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
      <input type="checkbox" value="${r.id}" class="responder-check w-4 h-4 text-blue-600 rounded border-gray-300"
             ${existingIds.includes(r.id) ? 'checked' : ''}
             data-same-purok="${isSamePurok ? '1' : '0'}"
             onchange="updateSelectedCount()">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-gray-800">${r.full_name}</p>
        <p class="text-xs text-gray-400 flex items-center gap-2">
          <span><i class="fa-solid fa-phone text-[10px] text-gray-400"></i> ${r.phone || 'No phone'}</span>
          <span>·</span>
          <span>${r.purok_name || 'No Purok'}</span>
        </p>
      </div>
      ${isSamePurok ? `<span class="text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full shrink-0"><i class="fa-solid fa-star text-amber-400 mr-1 text-[10px]"></i>Same Purok</span>` : ''}
    </label>`;

  let html = '';
  if (same.length) {
    html += `<div class="px-4 pt-3 pb-1 bg-blue-50/50"><p class="text-xs font-bold text-blue-800 uppercase tracking-wide">Purok Responders (${same.length})</p></div>`;
    html += same.map(r => makeItem(r, true)).join('');
  }
  if (others.length) {
    if (same.length) html += `<div class="border-t border-gray-200"></div>`;
    html += `<div class="px-4 pt-3 pb-1 bg-gray-50"><p class="text-xs font-bold text-gray-600 uppercase tracking-wide">${same.length ? 'Other Available Responders' : 'All Responders'}</p></div>`;
    html += others.map(r => makeItem(r, false)).join('');
  }

  container.innerHTML = html;
  updateSelectedCount();
}

function filterAssignList() {
  const query = document.getElementById('assign-responder-search')?.value.toLowerCase().trim() || '';
  const filtered = _assignRespondersList.filter(r =>
    (r.full_name || '').toLowerCase().includes(query) ||
    (r.phone || '').toLowerCase().includes(query) ||
    (r.purok_name || '').toLowerCase().includes(query)
  );
  // Maintain checked state
  const currentlyChecked = [...document.querySelectorAll('.responder-check:checked')].map(c => parseInt(c.value));
  renderAssignResponderList(filtered, _assignIncidentPurokId, currentlyChecked);
}

function selectSamePurokResponders() {
  document.querySelectorAll('.responder-check[data-same-purok="1"]').forEach(c => c.checked = true);
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = document.querySelectorAll('.responder-check:checked').length;
  document.getElementById('selected-count').textContent = `${count} responder${count !== 1 ? 's' : ''} selected`;
}

function clearResponderSelection() {
  document.querySelectorAll('.responder-check').forEach(c => c.checked = false);
  updateSelectedCount();
}

async function submitAssign() {
  const checked      = [...document.querySelectorAll('.responder-check:checked')];
  const responder_ids = checked.map(c => parseInt(c.value));
  if (!responder_ids.length) return showToast('Select at least one responder.', 'error');

  const res = await api.patch(`/incidents/${currentIncidentId}/assign`, { responder_ids });
  if (res && res.ok) {
    showToast(`${responder_ids.length} responder${responder_ids.length !== 1 ? 's' : ''} assigned and notified via SMS`);
    closeAssignModal();
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to assign responders', 'error');
  }
}

function closeModal()       { document.getElementById('incident-modal').classList.add('hidden'); }
function closeAssignModal() { document.getElementById('assign-modal').classList.add('hidden'); }
