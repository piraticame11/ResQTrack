let currentIncidentId      = null;
let currentIncidentPurokId = null;

(async function () {
  const user = requireRole('admin', 'responder');
  if (!user) return;
  setUserUI(user);

  const purokSel = document.getElementById('filter-purok');
  for (let i = 1; i <= 14; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = `Purok ${i}`;
    purokSel.appendChild(o);
  }

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
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${i.reporter_name || '—'}</td>
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3">
        <button onclick="openIncidentModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2">
          <i class="fa-solid fa-eye"></i> View
        </button>
        ${(i.status === 'Pending' || i.status === 'Dispatched')
          ? `<button onclick="openAssignModal(${i.id}, ${i.purok_id || 0})" class="text-green-600 hover:text-green-800 text-xs font-medium">
               <i class="fa-solid fa-user-plus"></i> Assign
             </button>`
          : ''}
      </td>
    </tr>`).join('');
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

  const photoHtml = inc.photo_path
    ? `<img src="${inc.photo_path}" class="w-full rounded-lg max-h-48 object-cover">`
    : `<p class="text-gray-400 text-sm italic">No photo uploaded</p>`;

  const respondersDisplay = inc.all_responder_names || inc.responder_name || 'Not assigned';

  document.getElementById('modal-content').innerHTML = `
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Type</span><p class="font-semibold"><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
      <div><span class="text-gray-500">Triage</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
      <div><span class="text-gray-500">Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
      <div><span class="text-gray-500">Purok</span><p class="font-semibold">${inc.purok_name || '—'}</p></div>
      <div><span class="text-gray-500">Reporter</span><p class="font-semibold">${inc.reporter_name}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Responder(s)</span><p class="font-semibold">${respondersDisplay}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Reported</span><p class="font-semibold">${formatDate(inc.reported_at)}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Description</span><p class="bg-gray-50 rounded-lg p-3 mt-1 text-gray-700">${inc.description}</p></div>
      ${inc.latitude ? `<div class="col-span-2"><span class="text-gray-500">GPS</span><p class="font-mono text-sm">${inc.latitude}, ${inc.longitude}</p></div>` : ''}
      <div class="col-span-2">${photoHtml}</div>
    </div>
    <div class="border-t pt-4 mt-2">
      <p class="text-sm font-medium text-gray-700 mb-2">Activity Log</p>
      <div class="space-y-2 max-h-36 overflow-y-auto">
        ${logs.map(l => `
          <div class="flex gap-3 text-xs">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
            <div>
              <span class="font-medium text-gray-700">${l.action}</span>
              ${l.note ? `<span class="text-gray-500"> — ${l.note}</span>` : ''}
              <span class="text-gray-400 block">${l.actor_name || 'System'} · ${formatDate(l.logged_at)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  const actionsDiv = document.getElementById('modal-actions');
  let html = '';

  if (inc.status === 'Pending') {
    html += `<button onclick="closeModal(); openAssignModal(${id}, ${inc.purok_id || 0})" class="btn-primary btn-sm">
               <i class="fa-solid fa-user-plus mr-1"></i> Assign Responders
             </button>`;
  } else if (inc.status === 'Dispatched') {
    html += `<button onclick="closeModal(); openAssignModal(${id}, ${inc.purok_id || 0})" class="btn-secondary btn-sm">
               <i class="fa-solid fa-user-pen mr-1"></i> Manage Responders
             </button>`;
    html += `<button onclick="changeStatus(${id},'Ongoing')" class="btn-primary btn-sm">Mark Ongoing</button>`;
    html += `<button onclick="changeStatus(${id},'Resolved')" class="btn-primary btn-sm">Mark Resolved</button>`;
  } else if (inc.status === 'Ongoing') {
    html += `<button onclick="changeStatus(${id},'Resolved')" class="btn-primary btn-sm">Mark Resolved</button>`;
  }

  html += `<button onclick="closeModal()" class="btn-secondary btn-sm ml-auto">Close</button>`;
  actionsDiv.innerHTML = html;
}

async function changeStatus(id, status) {
  const res = await api.patch(`/incidents/${id}/status`, { status });
  if (res && res.ok) {
    showToast(`Status updated to ${status}`);
    closeModal();
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to update status', 'error');
  }
}

// ── Assign Modal ─────────────────────────────────────────────────────────────

async function openAssignModal(id, purokId) {
  currentIncidentId = id;
  document.getElementById('assign-modal').classList.remove('hidden');

  // Reset list to loading state
  document.getElementById('responder-list').innerHTML =
    '<div class="px-4 py-6 text-center text-gray-400 text-sm">Loading responders…</div>';
  document.getElementById('selected-count').textContent = '0 selected';

  // Fetch current assignments to pre-check existing responders
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

  await loadRespondersForAssign(resolvedPurokId, existingIds);
}

async function loadRespondersForAssign(incidentPurokId, existingIds = []) {
  const container = document.getElementById('responder-list');

  const res = await api.get('/admin/users?role=responder');
  if (!res || !res.ok) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-red-400 text-sm">Failed to load responders.</div>';
    return;
  }

  const all    = (await res.json()).filter(r => r.is_active);
  const same   = all.filter(r => incidentPurokId && r.purok_id == incidentPurokId);
  const others = all.filter(r => !incidentPurokId || r.purok_id != incidentPurokId);

  if (!all.length) {
    container.innerHTML = '<div class="px-4 py-6 text-center text-gray-400 text-sm">No active responders available.</div>';
    return;
  }

  const makeItem = (r, badge) => `
    <label class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
      <input type="checkbox" value="${r.id}" class="responder-check w-4 h-4 text-blue-600 rounded border-gray-300"
             ${existingIds.includes(r.id) ? 'checked' : ''}
             onchange="updateSelectedCount()">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-800">${r.full_name}</p>
        <p class="text-xs text-gray-400">${r.purok_name || 'No Purok'}</p>
      </div>
      ${badge ? `<span class="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full shrink-0">Same Purok</span>` : ''}
    </label>`;

  let html = '';
  if (same.length) {
    html += `<div class="px-4 pt-3 pb-1"><p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Same Purok</p></div>`;
    html += same.map(r => makeItem(r, true)).join('');
  }
  if (others.length) {
    if (same.length) html += `<div class="border-t border-gray-100"></div>`;
    html += `<div class="px-4 pt-3 pb-1"><p class="text-xs font-semibold text-gray-400 uppercase tracking-wide">${same.length ? 'Other Responders' : 'All Responders'}</p></div>`;
    html += others.map(r => makeItem(r, false)).join('');
  }

  container.innerHTML = html;
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
    showToast(`${responder_ids.length} responder${responder_ids.length !== 1 ? 's' : ''} assigned and dispatched`);
    closeAssignModal();
    loadIncidents();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to assign responders', 'error');
  }
}

function closeModal()       { document.getElementById('incident-modal').classList.add('hidden'); }
function closeAssignModal() { document.getElementById('assign-modal').classList.add('hidden'); }
