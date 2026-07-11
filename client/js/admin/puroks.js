let allPuroks = [];

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  document.getElementById('purok-form').addEventListener('submit', handlePurokSubmit);
  await loadPuroks();
})();

async function loadPuroks() {
  const res = await api.get('/puroks');
  const tbody = document.getElementById('puroks-body');
  if (!res || !res.ok) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-10 text-center text-red-400">Failed to load puroks.</td></tr>`;
    return;
  }
  allPuroks = await res.json();

  if (!allPuroks.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-10 text-center text-gray-400">No puroks yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = allPuroks.map(p => `
    <tr class="table-row">
      <td class="px-4 py-3 text-xs font-mono text-gray-400">#${p.id}</td>
      <td class="px-4 py-3 text-sm font-medium text-gray-800">${p.name}</td>
      <td class="px-4 py-3 text-sm text-gray-600">${p.barangay}</td>
      <td class="px-4 py-3 flex gap-3">
        <button onclick="openEditPurok(${p.id})" class="text-blue-600 hover:text-blue-800 text-xs font-medium"><i class="fa-solid fa-pen"></i> Edit</button>
        <button onclick="removePurok(${p.id})" class="text-red-500 hover:text-red-700 text-xs font-medium"><i class="fa-solid fa-trash"></i> Delete</button>
      </td>
    </tr>`).join('');
}

function openAddPurok() {
  document.getElementById('purok-modal-title').textContent = 'Add Purok';
  document.getElementById('edit-purok-id').value = '';
  document.getElementById('purok-form').reset();
  document.getElementById('p-barangay').value = allPuroks[0]?.barangay || 'Barangay Manay';
  document.getElementById('purok-modal').classList.remove('hidden');
}

function openEditPurok(id) {
  const p = allPuroks.find(x => x.id === id);
  if (!p) return;
  document.getElementById('purok-modal-title').textContent = 'Edit Purok';
  document.getElementById('edit-purok-id').value = id;
  document.getElementById('p-name').value     = p.name;
  document.getElementById('p-barangay').value = p.barangay;
  document.getElementById('purok-modal').classList.remove('hidden');
}

function closePurokModal() { document.getElementById('purok-modal').classList.add('hidden'); }

async function handlePurokSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-purok-id').value;
  const payload = {
    name:     document.getElementById('p-name').value.trim(),
    barangay: document.getElementById('p-barangay').value.trim(),
  };

  const btn = document.getElementById('purok-submit-btn');
  btn.disabled = true;

  const res = id ? await api.patch(`/puroks/${id}`, payload) : await api.post('/puroks', payload);

  btn.disabled = false;
  if (res && res.ok) {
    showToast(id ? 'Purok updated' : 'Purok added');
    closePurokModal();
    await fetchPuroks(true); // refresh the shared cache used elsewhere
    await loadPuroks();
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Error saving purok', 'error');
  }
}

async function removePurok(id) {
  if (!confirm('Delete this purok? This only works if no residents, incidents, or blotter entries reference it.')) return;
  const res = await api.delete(`/puroks/${id}`);
  if (res && res.ok) {
    showToast('Purok deleted');
    await fetchPuroks(true);
    await loadPuroks();
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Error deleting purok', 'error');
  }
}
