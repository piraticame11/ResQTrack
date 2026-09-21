let allIncidents = [];
let currentUser  = null;
let modalMap     = null;

(async function () {
  currentUser = requireRole('responder', 'admin');
  if (!currentUser) return;
  setUserUI(currentUser);
  if (currentUser.role === 'admin') {
    document.getElementById('admin-nav-section')?.classList.remove('hidden');
  }

  document.getElementById('filter-search').addEventListener('keydown', e => { if (e.key === 'Enter') applyFilter(); });

  const res = await api.get('/incidents');
  if (!res || !res.ok) {
    document.getElementById('incidents-body').innerHTML =
      `<tr><td colspan="8" class="px-4 py-10 text-center text-red-400">Failed to load incidents.</td></tr>`;
    return;
  }

  const all = await res.json();
  allIncidents = all.filter(i => i.assigned_responder_id === currentUser.id);
  renderTable(allIncidents);
})();

function applyFilter() {
  const search = document.getElementById('filter-search').value.trim().toLowerCase();
  const status = document.getElementById('filter-status').value;
  const type   = document.getElementById('filter-type').value;

  const filtered = allIncidents.filter(i => {
    if (status && i.status !== status) return false;
    if (type   && i.incident_type !== type) return false;
    if (search && !i.reference_no.toLowerCase().includes(search) && !i.description.toLowerCase().includes(search)) return false;
    return true;
  });

  renderTable(filtered);
}

function renderTable(list) {
  const tbody = document.getElementById('incidents-body');
  document.getElementById('total-count').textContent = `${list.length} incident(s)`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-400">No incidents match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(i => `
    <tr class="table-row">
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${i.resolved_at ? formatDate(i.resolved_at) : '—'}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3">
        <button onclick="openModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium">
          <i class="fa-solid fa-eye"></i> View
        </button>
      </td>
    </tr>`).join('');
}

async function openModal(id) {
  document.getElementById('incident-modal').classList.remove('hidden');
  document.getElementById('modal-content').innerHTML = `<p class="text-center text-gray-400 py-6">Loading…</p>`;

  const [iRes, lRes] = await Promise.all([api.get(`/incidents/${id}`), api.get(`/incidents/${id}/logs`)]);
  const inc  = iRes && iRes.ok ? await iRes.json() : null;
  const logs = lRes && lRes.ok ? await lRes.json() : [];

  if (!inc) {
    document.getElementById('modal-content').innerHTML = `<p class="text-center text-red-400 py-6">Failed to load incident.</p>`;
    return;
  }

  document.getElementById('modal-ref').textContent = inc.reference_no;

  // Action buttons — only for incidents assigned to this responder
  const isMyIncident = inc.assigned_responder_id === currentUser.id;
  const actions = document.getElementById('modal-actions');
  const btnHtml = [];
  if (isMyIncident) {
    (INCIDENT_TRANSITIONS[inc.status] || []).forEach(s => {
      const icon = STATUS_ACTION_ICON[s] || 'fa-arrow-right';
      btnHtml.push(s === 'Delayed'
        ? `<button onclick="promptDelayReason(${id})" class="btn-warning btn-sm"><i class="fa-solid ${icon} mr-1"></i> Delayed</button>`
        : `<button onclick="changeStatus(${id},'${s}')" class="btn-primary btn-sm"><i class="fa-solid ${icon} mr-1"></i> ${s}</button>`);
    });
  }
  if (!inc.is_fake && !inc.is_spam) {
    btnHtml.push(`<button onclick="promptFlagSpam(${id})" class="text-xs text-amber-600 hover:underline self-center mr-2">
                     <i class="fa-solid fa-ban mr-1"></i> Flag as Spam
                   </button>`);
    btnHtml.push(`<button onclick="promptFlagFake(${id})" class="text-xs text-red-500 hover:underline self-center">
                     <i class="fa-solid fa-flag mr-1"></i> Flag as Fake
                   </button>`);
  }
  btnHtml.push(`<button onclick="closeModal()" class="btn-secondary btn-sm ml-auto">Close</button>`);
  actions.innerHTML = btnHtml.join('');

  const photos = inc.attachments?.length ? inc.attachments.map(a => a.file_path) : (inc.photo_path ? [inc.photo_path] : []);
  const photoHtml = photos.length
    ? `<div class="grid grid-cols-3 gap-2">${photos.map(p => `<a href="${p}" target="_blank" rel="noopener"><img src="${p}" class="w-full h-24 object-cover rounded-lg border border-gray-200"></a>`).join('')}</div>`
    : `<p class="text-gray-400 text-sm italic">No photo uploaded</p>`;

  const mapsLink = inc.latitude
    ? `<a href="https://www.google.com/maps?q=${inc.latitude},${inc.longitude}" target="_blank" rel="noopener"
         class="text-blue-600 text-xs hover:underline"><i class="fa-solid fa-map-location-dot mr-1"></i>Open in Maps</a>`
    : '';

  if (modalMap) { modalMap.remove(); modalMap = null; }

  document.getElementById('modal-content').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
      <!-- Left Column: Details & Description (7 cols) -->
      <div class="md:col-span-7 space-y-4">
        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-4">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-info text-blue-500"></i> Incident Overview
          </h4>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-400 text-xs font-medium">Triage Priority</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Incident Type</span><p class="font-semibold mt-0.5"><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
            <div><span class="text-gray-400 text-xs font-medium">Purok</span><p class="font-semibold text-gray-800">${inc.purok_name || '—'}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Reporter</span><p class="font-semibold text-gray-800">${inc.reporter_name}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Reporter Phone</span><p class="font-semibold text-gray-700">${inc.reporter_phone || '—'}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Current Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Reported Time</span><p class="font-medium text-gray-700 text-xs mt-0.5">${formatDate(inc.reported_at)}</p></div>
            <div><span class="text-gray-400 text-xs font-medium">Resolved Time</span><p class="font-medium text-gray-700 text-xs mt-0.5">${inc.resolved_at ? formatDate(inc.resolved_at) : '—'}</p></div>
          </div>
        </div>

        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block mb-1">Description / Narrative</span>
          <p class="text-gray-700 text-sm whitespace-pre-line leading-relaxed">${inc.description}</p>
        </div>

        ${photoHtml ? `
        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-2">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block"><i class="fa-solid fa-camera text-blue-500 mr-1"></i> Attached Photos</span>
          ${photoHtml}
        </div>` : ''}
      </div>

      <!-- Right Column: Map & Activity Log (5 cols) -->
      <div class="md:col-span-5 space-y-4">
        ${inc.latitude ? `
        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5" id="modal-map-card">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider flex items-center gap-1"><i class="fa-solid fa-location-dot text-red-500"></i> Location Map</span>
            <button type="button" id="btn-fs-modal-map" onclick="toggleMapFullscreen('modal-map-card', window.modalMap, 'btn-fs-modal-map')" class="text-gray-600 hover:text-gray-900 text-xs px-2 py-0.5 rounded border border-gray-200 bg-white hover:bg-gray-50 flex items-center" title="Full Screen">
              <i class="fa-solid fa-expand mr-1"></i><span>Fullscreen</span>
            </button>
          </div>
          <div id="modal-incident-map" class="rounded-lg overflow-hidden border border-gray-200 bg-gray-100" style="height:220px"></div>
          <div class="flex items-center justify-between mt-2 pt-1">
            <p class="font-mono text-xs text-gray-500">${inc.latitude}, ${inc.longitude}</p>
            ${mapsLink}
          </div>
        </div>` : ''}

        <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-2">
          <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block"><i class="fa-solid fa-clock-rotate-left text-indigo-500 mr-1"></i> Activity Log</span>
          <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
            ${logs.length ? logs.map(l => `
              <div class="flex gap-2.5 text-xs bg-white p-2.5 rounded-lg border border-gray-100">
                <div class="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0"></div>
                <div class="flex-1 min-w-0">
                  <span class="font-semibold text-gray-800">${l.action}</span>
                  ${l.note ? `<span class="text-gray-500 block text-[11px] mt-0.5"> — ${l.note}</span>` : ''}
                  <span class="text-gray-400 text-[10px] block mt-0.5">${l.actor_name || 'System'} · ${formatDate(l.logged_at)}</span>
                </div>
              </div>`).join('') : '<p class="text-gray-400 text-xs">No log entries.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  if (inc.latitude && inc.longitude) {
    if (modalMap) { modalMap.remove(); modalMap = null; }
    modalMap = L.map('modal-incident-map').setView([inc.latitude, inc.longitude], 16);
    window.modalMap = modalMap;
    setTimeout(() => { if (modalMap) modalMap.invalidateSize(); }, 200);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(modalMap);
    const mColor = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e' }[inc.triage_color] || '#6b7280';
    const mIcon = L.divIcon({
      html: `<div style="background:${mColor};width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
      className: '',
      iconSize: [16, 16],
    });
    L.marker([inc.latitude, inc.longitude], { icon: mIcon })
      .addTo(modalMap)
      .bindPopup(`<b>${inc.reference_no}</b><br>${inc.incident_type}`)
      .openPopup();
    setTimeout(() => modalMap.invalidateSize(), 150);
  }
}

function promptFlagSpam(id) {
  openReasonModal('Why is this being flagged as spam / duplicate? (This will archive the report)', reason => flagSpam(id, reason));
}

async function flagSpam(id, reason) {
  const res = await api.patch(`/incidents/${id}/flag-spam`, { reason });
  if (res && res.ok) {
    showToast('Incident flagged as spam and archived');
    closeModal();
    const r = await api.get('/incidents');
    if (r && r.ok) {
      const all = await r.json();
      allIncidents = all.filter(i => i.assigned_responder_id === currentUser.id);
      renderTable(allIncidents);
    }
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to flag incident as spam', 'error');
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
    const r = await api.get('/incidents');
    if (r && r.ok) {
      const all = await r.json();
      allIncidents = all.filter(i => i.assigned_responder_id === currentUser.id);
      renderTable(allIncidents);
    }
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to flag incident', 'error');
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
    // Refresh and re-apply the assignment filter
    const r = await api.get('/incidents');
    if (r && r.ok) {
      const all = await r.json();
      allIncidents = all.filter(i => i.assigned_responder_id === currentUser.id);
      renderTable(allIncidents);
    }
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to update status', 'error');
  }
}

function closeModal() {
  document.getElementById('incident-modal').classList.add('hidden');
  if (modalMap) { modalMap.remove(); modalMap = null; }
}
