let allIncidents = [];
let currentUser  = null;
let modalMap     = null;

(async function () {
  currentUser = requireRole('responder');
  if (!currentUser) return;
  setUserUI(currentUser);

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
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${i.resolved_at ? formatDate(i.resolved_at) : '—'}</td>
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
      const icon = s === 'Resolved' ? 'fa-circle-check' : 'fa-spinner';
      btnHtml.push(`<button onclick="changeStatus(${id},'${s}')" class="btn-primary btn-sm">
                      <i class="fa-solid ${icon} mr-1"></i> Mark ${s}
                    </button>`);
    });
  }
  if (!inc.is_fake) {
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
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Type</span><p class="font-semibold mt-0.5"><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
      <div><span class="text-gray-500">Triage</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
      <div><span class="text-gray-500">Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
      <div><span class="text-gray-500">Purok</span><p class="font-semibold">${inc.purok_name || '—'}</p></div>
      <div><span class="text-gray-500">Reporter</span><p class="font-semibold">${inc.reporter_name}</p></div>
      <div><span class="text-gray-500">Reporter Phone</span><p class="font-semibold">${inc.reporter_phone || '—'}</p></div>
      <div><span class="text-gray-500">Reported</span><p class="font-semibold">${formatDate(inc.reported_at)}</p></div>
      <div><span class="text-gray-500">Resolved</span><p class="font-semibold">${inc.resolved_at ? formatDate(inc.resolved_at) : '—'}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Description</span><p class="bg-gray-50 rounded-lg p-3 mt-1 text-gray-700">${inc.description}</p></div>
      ${inc.latitude ? `
      <div class="col-span-2">
        <span class="text-gray-500">Location</span>
        <div id="modal-incident-map" class="rounded-lg overflow-hidden mt-1.5" style="height:180px"></div>
        <div class="flex items-center justify-between mt-1">
          <p class="font-mono text-xs text-gray-400">${inc.latitude}, ${inc.longitude}</p>
          ${mapsLink}
        </div>
      </div>` : ''}
      <div class="col-span-2">${photoHtml}</div>
    </div>
    <div class="border-t pt-4 mt-2">
      <p class="text-sm font-medium text-gray-700 mb-2">Activity Log</p>
      <div class="space-y-2 max-h-36 overflow-y-auto">
        ${logs.length ? logs.map(l => `
          <div class="flex gap-3 text-xs">
            <div class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
            <div>
              <span class="font-medium text-gray-700">${l.action}</span>
              ${l.note ? `<span class="text-gray-500"> — ${l.note}</span>` : ''}
              <span class="text-gray-400 block">${l.actor_name || 'System'} · ${formatDate(l.logged_at)}</span>
            </div>
          </div>`).join('') : '<p class="text-gray-400 text-xs">No log entries.</p>'}
      </div>
    </div>`;

  if (inc.latitude && inc.longitude) {
    modalMap = L.map('modal-incident-map').setView([inc.latitude, inc.longitude], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(modalMap);
    const mColor = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e' }[inc.triage_color] || '#6b7280';
    const mIcon = L.divIcon({
      html: `<div style="background:${mColor};width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
      className: '',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker([inc.latitude, inc.longitude], { icon: mIcon })
      .addTo(modalMap)
      .bindPopup(`<b>${inc.reference_no}</b><br>${inc.incident_type}`)
      .openPopup();
    setTimeout(() => modalMap.invalidateSize(), 150);
  }
}

function promptFlagFake(id) {
  const reason = prompt('Why is this being flagged as a fake report?');
  if (!reason || !reason.trim()) return;
  flagFake(id, reason.trim());
}

async function flagFake(id, reason) {
  const res = await api.patch(`/incidents/${id}/flag-fake`, { reason });
  if (res && res.ok) {
    showToast('Incident flagged as fake');
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

async function changeStatus(id, status) {
  const res = await api.patch(`/incidents/${id}/status`, { status });
  if (res && res.ok) {
    showToast(`Marked as ${status}`);
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
