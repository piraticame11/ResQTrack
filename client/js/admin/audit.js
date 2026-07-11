let allLogs = [];

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  document.getElementById('search-audit').addEventListener('input', renderLogs);
  document.getElementById('filter-action').addEventListener('change', renderLogs);

  await loadLogs();
})();

async function loadLogs() {
  const res = await api.get('/audit');
  const tbody = document.getElementById('audit-body');
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-10 text-center text-red-400">Failed to load audit log.</td></tr>`;
    return;
  }
  allLogs = await res.json();

  const actionSel = document.getElementById('filter-action');
  const actions = [...new Set(allLogs.map(l => l.action))].sort();
  actionSel.innerHTML = '<option value="">All Actions</option>' +
    actions.map(a => `<option value="${a}">${a}</option>`).join('');

  renderLogs();
}

function renderLogs() {
  const search = document.getElementById('search-audit').value.trim().toLowerCase();
  const action = document.getElementById('filter-action').value;

  let list = allLogs;
  if (action) list = list.filter(l => l.action === action);
  if (search) {
    list = list.filter(l =>
      (l.actor_name || '').toLowerCase().includes(search) ||
      (l.details || '').toLowerCase().includes(search) ||
      (l.ip_address || '').toLowerCase().includes(search));
  }

  const tbody = document.getElementById('audit-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">No matching log entries.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(l => `
    <tr class="table-row">
      <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${formatDate(l.logged_at)}</td>
      <td class="px-4 py-3 text-sm text-gray-800">${l.actor_name || '—'}</td>
      <td class="px-4 py-3 text-sm font-medium text-gray-700">${l.action}</td>
      <td class="px-4 py-3 text-xs text-gray-500">${l.details || '—'}</td>
      <td class="px-4 py-3 text-xs font-mono text-gray-400">${l.ip_address || '—'}</td>
    </tr>`).join('');
}
