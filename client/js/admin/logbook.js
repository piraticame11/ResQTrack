(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  const purokSel = document.getElementById('filter-purok');
  for (let i = 1; i <= 14; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = `Purok ${i}`;
    purokSel.appendChild(o);
  }

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
      <td class="px-4 py-3 font-mono text-xs text-blue-600 font-medium">${i.reference_no}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">${i.description}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${i.reporter_name || '—'}</td>
      <td class="px-4 py-3">${triageBadge(i.triage_color)}</td>
      <td class="px-4 py-3">${statusBadge(i.status)}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${formatDate(i.reported_at)}</td>
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
    <div class="grid grid-cols-2 gap-3 text-sm">
      <div><span class="text-gray-500">Type</span><p><span class="inline-flex px-2 py-0.5 rounded text-xs ${typeColor(inc.incident_type)}">${inc.incident_type}</span></p></div>
      <div><span class="text-gray-500">Status</span><p>${statusBadge(inc.status)}</p></div>
      <div><span class="text-gray-500">Triage</span><p>${triageBadge(inc.triage_color)}</p></div>
      <div><span class="text-gray-500">Purok</span><p class="font-semibold">${inc.purok_name || '—'}</p></div>
      <div><span class="text-gray-500">Reporter</span><p class="font-semibold">${inc.reporter_name || '—'}</p></div>
      <div><span class="text-gray-500">Responder</span><p class="font-semibold">${inc.responder_name || '—'}</p></div>
      <div class="col-span-2"><span class="text-gray-500">Reported at</span><p class="font-semibold">${formatDate(inc.reported_at)}</p></div>
      ${inc.resolved_at ? `<div class="col-span-2"><span class="text-gray-500">Resolved at</span><p class="font-semibold">${formatDate(inc.resolved_at)}</p></div>` : ''}
      <div class="col-span-2"><span class="text-gray-500">Description</span><p class="bg-gray-50 rounded-lg p-3 mt-1">${inc.description}</p></div>
      ${inc.photo_path ? `<div class="col-span-2"><img src="${inc.photo_path}" class="w-full rounded-lg max-h-48 object-cover"></div>` : ''}
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
