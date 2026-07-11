let gpsWatchId  = null;
let incidentMap = null;
let modalMap    = null;
let currentUser = null;

(async function () {
  currentUser = requireRole('responder');
  if (!currentUser) return;
  setUserUI(currentUser);

  setInterval(() => {
    const el = document.getElementById('live-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH');
  }, 1000);

  await loadActive();
  initMap();

  const socket = io();
  socket.on('incident:status_update', () => loadActive());
  socket.on('incident:new',           () => loadActive());
})();

async function loadActive() {
  const res = await api.get('/incidents');
  if (!res || !res.ok) {
    const errRow = `<tr><td colspan="7" class="px-4 py-10 text-center text-red-400">Failed to load incidents. Please refresh.</td></tr>`;
    document.getElementById('queue-body').innerHTML  = errRow;
    document.getElementById('queue-cards').innerHTML = `<p class="text-center text-red-400 py-6 text-sm">Failed to load incidents. Please refresh.</p>`;
    return;
  }
  const all = await res.json();

  const active   = all.filter(i => ['Pending', 'Dispatched', 'Initiate', 'Delayed'].includes(i.status));
  const today    = new Date().toISOString().slice(0, 10);
  const myActive = active.filter(i => i.assigned_responder_id === currentUser.id);
  const resolved = all.filter(i => i.status === 'Resolved' && i.resolved_at?.slice(0, 10) === today);

  document.getElementById('stat-active').textContent   = myActive.length;
  document.getElementById('stat-resolved').textContent = resolved.length;
  document.getElementById('stat-total').textContent    = all.length;

  renderTable(active);
  renderCards(active);
  plotMapMarkers(active);
}

// ── Desktop table ────────────────────────────────────────────────────────────
function renderTable(list) {
  const tbody = document.getElementById('queue-body');
  document.getElementById('queue-count').textContent = `${list.length} active`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-gray-400">No active incidents at this time.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(i => {
    const isMine      = i.assigned_responder_id === currentUser.id;
    const mineBadge   = isMine ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-600 text-white ml-1">Mine</span>` : '';
    return `
    <tr class="table-row ${isMine ? 'bg-blue-50' : ''}">
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}${mineBadge}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3">
        <button onclick="openModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium">
          <i class="fa-solid fa-eye"></i> View
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── Mobile cards ─────────────────────────────────────────────────────────────
const TYPE_ICON = {
  Fire:    'fa-fire text-red-500',
  Rescue:  'fa-kit-medical text-blue-500',
  Crime:   'fa-shield-halved text-orange-500',
  Noise:   'fa-volume-high text-yellow-500',
  Garbage: 'fa-trash text-green-500',
  Other:   'fa-circle-exclamation text-gray-500',
};

const TRIAGE_CARD = {
  Red:    'border-l-red-500 bg-red-50',
  Orange: 'border-l-orange-500 bg-orange-50',
  Yellow: 'border-l-yellow-400 bg-yellow-50',
  Green:  'border-l-green-500 bg-green-50',
};

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (sec < 60)  return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  return formatDate(ts);
}

function renderCards(list) {
  const container = document.getElementById('queue-cards');

  if (!list.length) {
    container.innerHTML = `<p class="text-center text-gray-400 py-8 text-sm">No active incidents at this time.</p>`;
    return;
  }

  container.innerHTML = list.map(i => {
    const isMine     = i.assigned_responder_id === currentUser.id;
    const cardColor  = TRIAGE_CARD[i.triage_color] || 'border-l-gray-300 bg-white';
    const icon       = TYPE_ICON[i.incident_type]  || 'fa-circle-exclamation text-gray-500';
    const mineBadge  = isMine
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white"><i class="fa-solid fa-user-check mr-1 text-xs"></i>Mine</span>`
      : '';
    const btnClass   = isMine ? 'btn-primary' : 'btn-secondary';

    return `
    <div class="border-l-4 ${cardColor} rounded-r-xl shadow-sm p-4">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-bold text-gray-800 text-sm flex items-center gap-1.5">
            <i class="fa-solid ${icon}"></i>${i.incident_type}
          </span>
          ${triageBadge(i.triage_color)}
          ${statusBadge(i.status)}
        </div>
        ${mineBadge}
      </div>
      <div class="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="font-mono text-gray-600">${i.reference_no}</span>
        ${i.purok_name ? `<span>·</span><span class="font-medium text-gray-700">${i.purok_name}</span>` : ''}
        <span>·</span><span>${timeAgo(i.reported_at)}</span>
      </div>
      ${i.description ? `<p class="text-xs text-gray-500 mt-1.5 line-clamp-1">${i.description}</p>` : ''}
      <button onclick="openModal(${i.id})"
        class="${btnClass} w-full mt-3 flex items-center justify-center gap-2 py-2.5 text-sm">
        <i class="fa-solid fa-eye"></i> View Details
      </button>
    </div>`;
  }).join('');
}

// ── Map ───────────────────────────────────────────────────────────────────────
function initMap() {
  incidentMap = L.map('incident-map').setView([7.3456, 125.6022], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(incidentMap);
}

function plotMapMarkers(incidents) {
  if (!incidentMap) return;
  incidentMap.eachLayer(l => { if (l instanceof L.Marker) incidentMap.removeLayer(l); });

  incidents.forEach(i => {
    if (!i.latitude || !i.longitude) return;
    const isMine = i.assigned_responder_id === currentUser.id;
    const color  = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e' }[i.triage_color] || '#6b7280';
    const size   = isMine ? 18 : 12;
    const border = isMine ? '2px solid #2563eb' : '2px solid #fff';
    const icon   = L.divIcon({
      html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:${border};box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      className: '',
      iconSize: [size, size],
    });
    L.marker([i.latitude, i.longitude], { icon })
      .addTo(incidentMap)
      .bindPopup(`<b>${i.reference_no}</b><br>${i.incident_type} · ${i.purok_name || '—'}${isMine ? '<br><b style="color:#2563eb">Assigned to you</b>' : ''}`);
  });
}

// ── Incident detail modal ─────────────────────────────────────────────────────
async function openModal(id) {
  document.getElementById('incident-modal').classList.remove('hidden');
  document.getElementById('modal-content').innerHTML = `<p class="text-center text-gray-400 py-6">Loading…</p>`;
  document.getElementById('modal-actions').innerHTML = '';

  const [iRes, lRes] = await Promise.all([api.get(`/incidents/${id}`), api.get(`/incidents/${id}/logs`)]);
  const inc  = iRes && iRes.ok ? await iRes.json() : null;
  const logs = lRes && lRes.ok ? await lRes.json() : [];

  if (!inc) {
    document.getElementById('modal-content').innerHTML = `<p class="text-center text-red-400 py-6">Failed to load incident.</p>`;
    return;
  }

  document.getElementById('modal-ref').textContent = inc.reference_no;

  const photos = inc.attachments?.length ? inc.attachments.map(a => a.file_path) : (inc.photo_path ? [inc.photo_path] : []);
  const photoHtml = photos.length
    ? `<div class="grid grid-cols-3 gap-2">${photos.map(p => `<a href="${p}" target="_blank" rel="noopener"><img src="${p}" class="w-full h-24 object-cover rounded-lg border border-gray-200"></a>`).join('')}</div>`
    : `<p class="text-gray-400 text-sm italic">No photo uploaded</p>`;

  const mapsLink = inc.latitude
    ? `<a href="https://www.google.com/maps?q=${inc.latitude},${inc.longitude}" target="_blank" rel="noopener"
         class="text-blue-600 text-xs hover:underline"><i class="fa-solid fa-map-location-dot mr-1"></i>Open in Maps</a>`
    : '';

  const isMyIncident = inc.assigned_responder_id === currentUser.id;

  document.getElementById('modal-content').innerHTML = `
    ${isMyIncident ? `<div class="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 text-xs font-medium"><i class="fa-solid fa-user-check mr-1"></i>This incident is assigned to you</div>` : ''}
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Type</span><p class="font-semibold mt-0.5"><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
      <div><span class="text-gray-500">Triage</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
      <div><span class="text-gray-500">Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
      <div><span class="text-gray-500">Purok</span><p class="font-semibold">${inc.purok_name || '—'}</p></div>
      <div><span class="text-gray-500">Reporter</span><p class="font-semibold">${inc.reporter_name}</p></div>
      <div><span class="text-gray-500">Phone</span><p class="font-semibold">${inc.reporter_phone || '—'}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Reported</span><p class="font-semibold">${formatDate(inc.reported_at)}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Description</span><p class="bg-gray-50 rounded-lg p-3 mt-1 text-gray-700 text-sm">${inc.description}</p></div>
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
    if (modalMap) { modalMap.remove(); modalMap = null; }
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

  const actionsHtml = [];
  if (isMyIncident) {
    (INCIDENT_TRANSITIONS[inc.status] || []).forEach(s => {
      actionsHtml.push(`<button onclick="changeStatus(${id},'${s}')" class="btn-primary btn-sm">Mark ${s}</button>`);
    });
  }
  if (!inc.is_fake) {
    actionsHtml.push(`<button onclick="promptFlagFake(${id})" class="text-xs text-red-500 hover:underline self-center">
                         <i class="fa-solid fa-flag mr-1"></i> Flag as Fake
                       </button>`);
  }
  actionsHtml.push(`<button onclick="closeModal()" class="btn-secondary btn-sm ml-auto">Close</button>`);
  document.getElementById('modal-actions').innerHTML = actionsHtml.join('');
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
    loadActive();
  } else {
    const data = res ? await res.json() : null;
    showToast(data?.message || 'Failed to flag incident', 'error');
  }
}

async function changeStatus(id, status) {
  const res = await api.patch(`/incidents/${id}/status`, { status });
  if (res && res.ok) {
    showToast(`Incident marked as ${status}`);
    closeModal();
    loadActive();
  } else {
    showToast('Failed to update status', 'error');
  }
}

function closeModal() {
  document.getElementById('incident-modal').classList.add('hidden');
  if (modalMap) { modalMap.remove(); modalMap = null; }
}

// ── GPS location sharing ──────────────────────────────────────────────────────
function toggleGPS() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    setGPSUI(false);
    showToast('Location sharing stopped', 'info');
    return;
  }

  if (!navigator.geolocation) {
    showToast('Geolocation is not supported by this browser', 'error');
    return;
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      api.post('/responders/location', { latitude, longitude });
      document.getElementById('gps-coords').textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      document.getElementById('gps-coords').classList.remove('hidden');
    },
    err => {
      showToast('GPS error: ' + err.message, 'error');
      gpsWatchId = null;
      setGPSUI(false);
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  );

  setGPSUI(true);
  showToast('Location sharing started', 'success');
}

function setGPSUI(active) {
  const dot    = document.getElementById('gps-dot');
  const label  = document.getElementById('gps-label');
  const btn    = document.getElementById('gps-btn-text');
  const coords = document.getElementById('gps-coords');

  if (active) {
    dot.classList.replace('bg-gray-300', 'bg-green-500');
    label.textContent = 'Sharing location…';
    label.classList.replace('text-gray-500', 'text-green-600');
    btn.textContent = 'Stop Sharing Location';
  } else {
    dot.classList.replace('bg-green-500', 'bg-gray-300');
    label.textContent = 'Not sharing';
    label.classList.replace('text-green-600', 'text-gray-500');
    btn.textContent = 'Start Sharing Location';
    coords.classList.add('hidden');
  }
}
