let currentTab = 'all';
let allUsers   = [];

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  // Populate purok select in form
  const purokSel = document.getElementById('u-purok');
  for (let i = 1; i <= 14; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = `Purok ${i}`;
    purokSel.appendChild(o);
  }

  document.getElementById('user-form').addEventListener('submit', handleUserSubmit);
  document.getElementById('search-user').addEventListener('input', renderUsers);

  await loadUsers();
})();

async function loadUsers() {
  const res = await api.get('/admin/users');
  if (res && res.ok) {
    allUsers = await res.json();
    renderUsers();
  }
}

function setTab(tab) {
  currentTab = tab;
  ['all','responder','resident'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (t === tab) {
      btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white';
    } else {
      btn.className = 'px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200';
    }
  });
  renderUsers();
}

function renderUsers() {
  const search  = document.getElementById('search-user').value.toLowerCase();
  let list = allUsers;
  if (currentTab !== 'all') list = list.filter(u => u.role === currentTab);
  if (search) list = list.filter(u => u.full_name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));

  const tbody = document.getElementById('users-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-10 text-center text-gray-400">No users found.</td></tr>`;
    return;
  }

  const roleBadge = r => {
    const map = { admin: 'bg-purple-100 text-purple-700', responder: 'bg-blue-100 text-blue-700', resident: 'bg-gray-100 text-gray-700' };
    return `<span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${map[r] || ''}">${r}</span>`;
  };

  tbody.innerHTML = list.map(u => `
    <tr class="table-row">
      <td class="px-4 py-3 text-sm font-medium text-gray-800">${u.full_name}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${u.email}</td>
      <td class="px-4 py-3">${roleBadge(u.role)}</td>
      <td class="px-4 py-3 text-sm text-gray-500">${u.purok_name || '—'}</td>
      <td class="px-4 py-3">
        ${u.is_verified
          ? `<span class="text-green-600 text-xs"><i class="fa-solid fa-check"></i> Verified</span>`
          : `<button onclick="verifyUser(${u.id})" class="text-orange-500 text-xs hover:underline"><i class="fa-solid fa-clock"></i> Verify</button>`}
      </td>
      <td class="px-4 py-3">
        <span class="text-xs ${u.is_active ? 'text-green-600' : 'text-gray-400'}">
          ${u.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td class="px-4 py-3 flex gap-2">
        <button onclick="openEditModal(${u.id})" class="text-blue-600 hover:text-blue-800 text-xs"><i class="fa-solid fa-pen"></i> Edit</button>
        <button onclick="toggleActive(${u.id}, ${u.is_active})" class="text-xs ${u.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'}">
          ${u.is_active ? '<i class="fa-solid fa-ban"></i> Deactivate' : '<i class="fa-solid fa-check"></i> Activate'}
        </button>
      </td>
    </tr>`).join('');
}

function openCreateModal() {
  document.getElementById('user-modal-title').textContent = 'Add User';
  document.getElementById('edit-user-id').value = '';
  document.getElementById('user-form').reset();
  document.getElementById('password-label').textContent = 'Password *';
  document.getElementById('u-password').required = true;
  document.getElementById('user-modal').classList.remove('hidden');
}

function openEditModal(id) {
  const u = allUsers.find(x => x.id === id);
  if (!u) return;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('edit-user-id').value   = id;
  document.getElementById('u-full_name').value    = u.full_name;
  document.getElementById('u-email').value        = u.email;
  document.getElementById('u-phone').value        = u.phone || '';
  document.getElementById('u-role').value         = u.role;
  document.getElementById('u-purok').value        = u.purok_id || '';
  document.getElementById('u-password').value     = '';
  document.getElementById('u-password').required  = false;
  document.getElementById('password-label').textContent = 'New Password (leave blank to keep)';
  document.getElementById('user-modal').classList.remove('hidden');
}

async function handleUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const payload = {
    full_name: document.getElementById('u-full_name').value.trim(),
    email:     document.getElementById('u-email').value.trim(),
    phone:     document.getElementById('u-phone').value.trim() || null,
    role:      document.getElementById('u-role').value,
    purok_id:  document.getElementById('u-purok').value || null,
  };
  const pw = document.getElementById('u-password').value;
  if (pw) payload.password = pw;

  const btn = document.getElementById('user-submit-btn');
  btn.disabled = true;

  const res = id ? await api.patch(`/admin/users/${id}`, payload) : await api.post('/admin/users', payload);

  btn.disabled = false;
  if (res && res.ok) {
    showToast(id ? 'User updated' : 'User created');
    closeUserModal();
    await loadUsers();
  } else {
    const err = res ? await res.json() : {};
    showToast(err.message || 'Error saving user', 'error');
  }
}

async function verifyUser(id) {
  const res = await api.patch(`/admin/users/${id}/verify`, {});
  if (res && res.ok) { showToast('User verified'); await loadUsers(); }
}

async function toggleActive(id, isActive) {
  const res = await api.patch(`/admin/users/${id}`, { is_active: isActive ? 0 : 1 });
  if (res && res.ok) { showToast(isActive ? 'User deactivated' : 'User activated'); await loadUsers(); }
}

function closeUserModal() { document.getElementById('user-modal').classList.add('hidden'); }
