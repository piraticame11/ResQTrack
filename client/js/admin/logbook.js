(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  await populatePurokSelect(document.getElementById('filter-purok'), { placeholder: 'All Puroks' });

  const searchInput = document.getElementById('search-log');
  let debounceTimer;
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadLogbook(); });
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadLogbook, 350);
  });

  document.getElementById('filter-status').addEventListener('change', loadLogbook);
  document.getElementById('filter-purok').addEventListener('change', loadLogbook);

  await loadLogbook();
})();

async function loadLogbook() {
  const status = document.getElementById('filter-status').value;
  const purok  = document.getElementById('filter-purok').value;
  const search = document.getElementById('search-log').value.trim();

  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (purok)  params.append('purok_id', purok);
  if (search) params.append('search', search);

  const tbody = document.getElementById('logbook-body');
  tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-10 text-center text-gray-400">Loading…</td></tr>`;

  const res = await api.get(`/incidents?${params}`);
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-10 text-center text-red-400">Failed to load.</td></tr>`;
    return;
  }
  const incidents = await res.json();

  if (!incidents.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-4 py-10 text-center text-gray-400">No records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = incidents.map(i => `
    <tr class="table-row">
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">${i.description}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${i.reporter_name || '—'}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3">
        <button onclick="openDetailModal(${i.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
    </tr>`).join('');
}

async function openDetailModal(id) {
  document.getElementById('detail-modal').classList.remove('hidden');
  const [iRes, lRes] = await Promise.all([api.get(`/incidents/${id}`), api.get(`/incidents/${id}/logs`)]);
  const inc  = iRes && iRes.ok ? await iRes.json() : null;
  const logs = lRes && lRes.ok ? await lRes.json() : [];
  if (!inc) return;

  document.getElementById('detail-ref').textContent = inc.reference_no;

  document.getElementById('detail-content').innerHTML = `
    <div class="space-y-4">
      <div class="bg-gray-50/80 rounded-xl border border-gray-200 p-4">
        <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info text-blue-500"></i> Incident Details
        </h4>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-gray-400 text-xs font-medium">Triage Priority</span><p class="mt-0.5">${triageBadge(inc.triage_color)}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Incident Type</span><p><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
          <div><span class="text-gray-400 text-xs font-medium">Purok</span><p class="font-semibold text-gray-800">${inc.purok_name || '—'}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Reporter</span><p class="font-semibold text-gray-800">${inc.reporter_name || '—'}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Primary Responder</span><p class="font-semibold text-gray-800">${inc.responder_name || '—'}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Final Status</span><p class="mt-0.5">${statusBadge(inc.status)}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Reported At</span><p class="font-medium text-gray-700 text-xs mt-0.5">${formatDate(inc.reported_at)}</p></div>
          <div><span class="text-gray-400 text-xs font-medium">Resolved At</span><p class="font-medium text-gray-700 text-xs mt-0.5">${inc.resolved_at ? formatDate(inc.resolved_at) : '—'}</p></div>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block mb-1">Description / Narrative</span>
        <p class="text-gray-700 text-sm whitespace-pre-line leading-relaxed">${inc.description}</p>
      </div>

      ${(inc.attachments?.length ? inc.attachments.map(a => a.file_path) : (inc.photo_path ? [inc.photo_path] : [])).length
        ? `<div class="bg-gray-50/80 rounded-xl border border-gray-200 p-3.5 space-y-2">
             <span class="text-gray-500 text-xs font-semibold uppercase tracking-wider block"><i class="fa-solid fa-camera text-blue-500 mr-1"></i> Attached Photos</span>
             <div class="grid grid-cols-3 gap-2">
               ${(inc.attachments?.length ? inc.attachments.map(a => a.file_path) : [inc.photo_path]).map(p => `<a href="${p}" target="_blank" rel="noopener" class="group"><img src="${p}" class="w-full h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-90 transition-opacity"></a>`).join('')}
             </div>
           </div>`
        : ''}
    </div>`;

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

function closeDetailModal() { document.getElementById('detail-modal').classList.add('hidden'); }
