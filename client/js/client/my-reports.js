(async function () {
  const user = requireRole('resident', 'admin', 'responder');
  if (!user) return;

  await loadMyReports();

  // Real-time status updates
  const socket = io();
  socket.on('incident:status_update', ({ id, status, reporter_id, reference_no, responder_name }) => {
    // Only notify the incident's owner
    if (reporter_id && reporter_id !== user.id) return;

    const card = document.querySelector(`[data-incident-id="${id}"]`);
    if (card) {
      // Update status badge (keep the wrapper span intact)
      const badge = card.querySelector('.status-badge');
      if (badge) badge.innerHTML = statusBadge(status);

      // Add or update assigned-responder row
      if (responder_name) {
        let section = card.querySelector('[data-responder-section]');
        if (!section) {
          section = document.createElement('div');
          section.setAttribute('data-responder-section', '');
          section.className = 'mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500';
          card.appendChild(section);
        }
        section.innerHTML = `
          <i class="fa-solid fa-user-shield text-blue-400"></i>
          Assigned to <span class="font-medium text-gray-700">${responder_name}</span>`;
      }
    }

    // Prominent slide-in notification
    const ref = reference_no ? ` [${reference_no}]` : '';
    const messages = {
      Dispatched: responder_name
        ? `Responder assigned: ${responder_name}`
        : 'A responder has been dispatched to your incident.',
      Initiate: 'Responders are now actively handling your incident.',
      Delayed:  'Your assigned responder reported a delay — they are still on their way.',
      Resolved: 'Your incident has been marked as resolved.',
      Pending:  'Your incident is pending response.',
      Archived: 'Your incident has been archived.',
    };
    showIncidentNotification(
      `Incident Update${ref}`,
      messages[status] || `Status changed to ${status}`,
      status
    );
  });
})();

async function loadMyReports() {
  const container = document.getElementById('reports-container');

  const res = await api.get('/incidents');
  if (!res || !res.ok) {
    container.innerHTML = `<div class="text-center py-12 text-red-400"><p>Failed to load reports.</p></div>`;
    return;
  }
  const reports = await res.json();

  if (!reports.length) {
    container.innerHTML = `
      <div class="text-center py-16 space-y-4">
        <div class="text-5xl">📋</div>
        <p class="text-gray-500 font-medium">No reports yet</p>
        <p class="text-gray-400 text-sm">When you report an incident, it will appear here.</p>
        <a href="/pages/client/report-incident.html" class="btn-danger inline-flex items-center gap-2 mt-2">
          <i class="fa-solid fa-plus"></i> Report an Incident
        </a>
      </div>`;
    return;
  }

  container.innerHTML = reports.map(r => `
    <div class="card cursor-pointer hover:shadow-md transition-shadow" data-incident-id="${r.id}" onclick="openDetailModal(${r.id})">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 flex-wrap mb-2">
            <span class="font-mono text-xs font-bold text-blue-600">${r.reference_no}</span>
            <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(r.incident_type)}">${r.incident_type}</span>
            ${triageBadge(r.triage_color)}
          </div>
          <p class="text-gray-700 text-sm line-clamp-2">${r.description}</p>
          <div class="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <span><i class="fa-solid fa-map-pin mr-1"></i>${r.purok_name || 'No purok'}</span>
            <span><i class="fa-solid fa-clock mr-1"></i>${formatDate(r.reported_at)}</span>
          </div>
        </div>
        <div class="shrink-0">
          <span class="status-badge">${statusBadge(r.status)}</span>
        </div>
      </div>
      ${r.responder_name ? `
        <div class="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500" data-responder-section>
          <i class="fa-solid fa-user-shield text-blue-400"></i>
          Assigned to <span class="font-medium text-gray-700">${r.responder_name}</span>
        </div>` : '<div data-responder-section></div>'}
    </div>`).join('');
}

async function openDetailModal(id) {
  document.getElementById('detail-modal').classList.remove('hidden');
  document.getElementById('modal-content').innerHTML = `<p class="text-center text-gray-400 py-4"><i class="fa-solid fa-spinner fa-spin"></i></p>`;
  document.getElementById('modal-timeline').innerHTML = '';

  const [iRes, lRes] = await Promise.all([
    api.get(`/incidents/${id}`),
    api.get(`/incidents/${id}/logs`),
  ]);
  const inc  = iRes && iRes.ok ? await iRes.json() : null;
  const logs = lRes && lRes.ok ? await lRes.json() : [];

  if (!inc) {
    document.getElementById('modal-content').innerHTML = `<p class="text-red-400 text-sm text-center">Failed to load details.</p>`;
    return;
  }

  document.getElementById('modal-ref').textContent = inc.reference_no;

  document.getElementById('modal-content').innerHTML = `
    <div class="space-y-3 text-sm">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(inc.incident_type)}">${inc.incident_type}</span>
        ${statusBadge(inc.status)}
        ${triageBadge(inc.triage_color)}
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><span class="text-gray-500 text-xs">Purok</span><p class="font-medium">${inc.purok_name || '—'}</p></div>
        <div><span class="text-gray-500 text-xs">Reported</span><p class="font-medium">${formatDate(inc.reported_at)}</p></div>
        ${inc.responder_name ? `<div class="col-span-2"><span class="text-gray-500 text-xs">Assigned Responder</span><p class="font-medium text-blue-700"><i class="fa-solid fa-user-shield mr-1"></i>${inc.responder_name}</p></div>` : ''}
        ${inc.resolved_at ? `<div class="col-span-2"><span class="text-gray-500 text-xs">Resolved</span><p class="font-medium text-green-700">${formatDate(inc.resolved_at)}</p></div>` : ''}
      </div>
      <div>
        <span class="text-gray-500 text-xs">Description</span>
        <p class="bg-gray-50 rounded-lg p-3 mt-1 text-gray-700">${inc.description}</p>
      </div>
      ${(inc.attachments?.length ? inc.attachments.map(a => a.file_path) : (inc.photo_path ? [inc.photo_path] : [])).length
        ? `<div class="grid grid-cols-3 gap-2">${(inc.attachments?.length ? inc.attachments.map(a => a.file_path) : [inc.photo_path]).map(p => `<a href="${p}" target="_blank" rel="noopener"><img src="${p}" class="w-full h-24 object-cover rounded-lg border border-gray-200"></a>`).join('')}</div>`
        : ''}
    </div>`;

  // Timeline
  const timeline = document.getElementById('modal-timeline');
  if (!logs.length) {
    timeline.innerHTML = `<p class="text-gray-400 text-xs">No activity yet.</p>`;
  } else {
    timeline.innerHTML = logs.map((l, idx) => `
      <div class="flex gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full ${idx === logs.length - 1 ? 'bg-blue-500' : 'bg-gray-300'} shrink-0 mt-0.5"></div>
          ${idx < logs.length - 1 ? '<div class="w-0.5 flex-1 bg-gray-200 mt-1"></div>' : ''}
        </div>
        <div class="pb-3 flex-1">
          <p class="text-sm font-medium text-gray-700">${l.action}</p>
          ${l.note ? `<p class="text-xs text-gray-500 mt-0.5">${l.note}</p>` : ''}
          <p class="text-xs text-gray-400 mt-0.5">${formatDate(l.logged_at)}</p>
        </div>
      </div>`).join('');
  }
}

function closeDetailModal() { document.getElementById('detail-modal').classList.add('hidden'); }

function showIncidentNotification(title, body, status) {
  const styles = {
    Dispatched: { border: '#3b82f6', bg: '#eff6ff', icon: '🚑' },
    Initiate:   { border: '#6366f1', bg: '#eef2ff', icon: '🚨' },
    Delayed:    { border: '#d97706', bg: '#fffbeb', icon: '⏳' },
    Resolved:   { border: '#22c55e', bg: '#f0fdf4', icon: '✅' },
    Archived:   { border: '#9ca3af', bg: '#f9fafb', icon: '📁' },
  };
  const s = styles[status] || { border: '#6366f1', bg: '#eef2ff', icon: '📋' };

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:1rem', 'left:50%',
    'transform:translateX(-50%) translateY(-6rem)',
    'z-index:9999', 'width:92vw', 'max-width:400px',
    'opacity:0', 'transition:transform 0.35s ease, opacity 0.35s ease',
  ].join(';');
  el.innerHTML = `
    <div style="background:${s.bg};border-left:4px solid ${s.border}"
         class="rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <span class="text-2xl shrink-0 mt-0.5">${s.icon}</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-800 text-sm">${title}</p>
        <p class="text-gray-600 text-xs mt-0.5 leading-relaxed">${body}</p>
      </div>
      <button class="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 ml-1"
              onclick="this.closest('div[style]').remove()">×</button>
    </div>`;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.opacity   = '1';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(-50%) translateY(-6rem)';
    el.style.opacity   = '0';
    setTimeout(() => el.remove(), 350);
  }, 8000);
}
