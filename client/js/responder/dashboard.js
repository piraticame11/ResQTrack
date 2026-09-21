const SERVICE_AREA_FALLBACK_CENTER = [7.3269, 125.6352];
const SERVICE_AREA_FALLBACK_ZOOM   = 12;

let gpsWatchId        = null;
let incidentMap       = null;
let modalMap          = null;
let currentUser       = null;
let responderGpsMarker = null;

(async function () {
  currentUser = requireRole('responder', 'admin');
  if (!currentUser) return;
  setUserUI(currentUser);
  if (currentUser.role === 'admin') {
    document.getElementById('admin-nav-section')?.classList.remove('hidden');
  }

  setInterval(() => {
    const el = document.getElementById('live-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH');
  }, 1000);

  initMap();
  await loadActive();

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

  const active   = all.filter(i => ['Pending', 'Assigned', 'Initiate', 'Delayed'].includes(i.status));
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
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}${mineBadge}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
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
  Fights:  'fa-hand-fist text-red-600',
  Flood:   'fa-water text-cyan-600',
  Missing: 'fa-person-circle-question text-purple-600',
  Noise:   'fa-volume-high text-yellow-500',
  Other:   'fa-circle-exclamation text-gray-500',
  'Flagged as Fake': 'fa-triangle-exclamation text-gray-500',
  Spam:    'fa-ban text-gray-500',
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

    return `
    <div class="border-l-4 ${cardColor} rounded-r-xl shadow-sm p-4 bg-white">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="flex items-center gap-2 flex-wrap">
          ${triageBadge(i.triage_color)}
          <span class="font-bold text-gray-800 text-sm flex items-center gap-1.5">
            <i class="fa-solid ${icon}"></i>${i.incident_type}
          </span>
          ${statusBadge(i.status)}
        </div>
        ${mineBadge}
      </div>
      <div class="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="font-mono text-gray-600">${i.reference_no}</span>
        ${i.purok_name ? `<span>·</span><span class="font-medium text-gray-700">${i.purok_name}</span>` : ''}
        <span>·</span><span>${timeAgo(i.reported_at)}</span>
      </div>
      <div class="mt-3 flex items-center justify-end gap-2 border-t pt-2.5">
        <button onclick="openModal(${i.id})" class="btn-primary btn-sm text-xs">
          <i class="fa-solid fa-eye mr-1"></i> View Details
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Map ───────────────────────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('incident-map');
  if (!container) return;
  if (incidentMap) {
    setTimeout(() => incidentMap.invalidateSize(), 150);
    return;
  }
  if (container._leaflet_id) {
    container._leaflet_id = null;
  }
  incidentMap = L.map('incident-map').setView(SERVICE_AREA_FALLBACK_CENTER, SERVICE_AREA_FALLBACK_ZOOM);
  window.incidentMap = incidentMap;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(incidentMap);
  setTimeout(() => incidentMap.invalidateSize(), 200);
}

function plotMapMarkers(incidents) {
  if (!incidentMap) return;

  // Remove existing incident markers (leave responder GPS marker if present)
  incidentMap.eachLayer(l => {
    if (l instanceof L.Marker && l !== responderGpsMarker) {
      incidentMap.removeLayer(l);
    }
  });

  const points = [];
  incidents.forEach(i => {
    if (!i.latitude || !i.longitude) return;
    const isMine = i.assigned_responder_id === currentUser.id;
    const color  = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e' }[i.triage_color] || '#6b7280';
    const size   = isMine ? 18 : 12;
    const border = isMine ? '3px solid #2563eb' : '2px solid #fff';
    const icon   = L.divIcon({
      html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:${border};box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
      className: '',
      iconSize: [size, size],
    });
    L.marker([i.latitude, i.longitude], { icon })
      .addTo(incidentMap)
      .bindPopup(`<b>${i.reference_no}</b><br>${i.incident_type} · ${i.purok_name || '—'}${isMine ? '<br><b style="color:#2563eb">Assigned to you</b>' : ''}`);
    points.push([i.latitude, i.longitude]);
  });

  if (responderGpsMarker) {
    const latlng = responderGpsMarker.getLatLng();
    points.push([latlng.lat, latlng.lng]);
  }

  if (points.length) {
    incidentMap.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
  } else {
    incidentMap.setView(SERVICE_AREA_FALLBACK_CENTER, SERVICE_AREA_FALLBACK_ZOOM);
  }
  setTimeout(() => incidentMap.invalidateSize(), 150);
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
    ${isMyIncident ? `<div class="bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2 mb-4"><i class="fa-solid fa-user-check text-base"></i> You are assigned to respond to this incident.</div>` : ''}
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
            <div class="col-span-2 pt-1.5 border-t border-gray-200/80">
              <span class="text-gray-400 text-xs font-medium">Reported Time</span>
              <p class="font-medium text-gray-700 text-xs mt-0.5">${formatDate(inc.reported_at)}</p>
            </div>
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
      const icon = STATUS_ACTION_ICON[s] || 'fa-arrow-right';
      actionsHtml.push(s === 'Delayed'
        ? `<button onclick="closeModal(); promptDelayReason(${id})" class="btn-warning btn-sm"><i class="fa-solid ${icon} mr-1"></i> Delayed</button>`
        : `<button onclick="changeStatus(${id},'${s}')" class="btn-primary btn-sm"><i class="fa-solid ${icon} mr-1"></i> ${s}</button>`);
    });
  }
  if (!inc.is_fake && !inc.is_spam) {
    actionsHtml.push(`<button onclick="promptFlagSpam(${id})" class="text-xs text-amber-600 hover:underline self-center mr-2">
                         <i class="fa-solid fa-ban mr-1"></i> Flag as Spam
                       </button>`);
    actionsHtml.push(`<button onclick="promptFlagFake(${id})" class="text-xs text-red-500 hover:underline self-center">
                         <i class="fa-solid fa-flag mr-1"></i> Flag as Fake
                       </button>`);
  }
  actionsHtml.push(`<button onclick="closeModal()" class="btn-secondary btn-sm ml-auto">Close</button>`);
  document.getElementById('modal-actions').innerHTML = actionsHtml.join('');
}

function promptFlagSpam(id) {
  openReasonModal('Why is this being flagged as spam / duplicate? (This will archive the report)', reason => flagSpam(id, reason));
}

async function flagSpam(id, reason) {
  const res = await api.patch(`/incidents/${id}/flag-spam`, { reason });
  if (res && res.ok) {
    showToast('Incident flagged as spam and archived');
    closeModal();
    loadActive();
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
    loadActive();
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
    if (responderGpsMarker && incidentMap) {
      incidentMap.removeLayer(responderGpsMarker);
      responderGpsMarker = null;
    }
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

      if (incidentMap) {
        const liveIcon = L.divIcon({
          html: `<div style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,0.4)"></div>`,
          className: '', iconSize: [16, 16],
        });
        if (!responderGpsMarker) {
          responderGpsMarker = L.marker([latitude, longitude], { icon: liveIcon })
            .addTo(incidentMap)
            .bindPopup('<b>Your Live Position</b>');
        } else {
          responderGpsMarker.setLatLng([latitude, longitude]);
        }
      }
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
