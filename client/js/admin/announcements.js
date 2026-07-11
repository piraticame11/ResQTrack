(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  document.getElementById('announcement-form').addEventListener('submit', handleAnnSubmit);
  document.getElementById('contact-form').addEventListener('submit', handleContactSubmit);

  await Promise.all([loadAnnouncements(), loadContacts()]);
})();

let allAnnouncements = [];

async function loadAnnouncements() {
  const res = await api.get('/announcements');
  const list = res && res.ok ? await res.json() : [];
  allAnnouncements = list;
  const container = document.getElementById('announcements-list');

  if (!list.length) {
    container.innerHTML = `<p class="text-gray-400 text-sm text-center py-4">No announcements yet.</p>`;
    return;
  }

  container.innerHTML = list.map(a => {
    const scheduledBadge = !a.is_published && a.scheduled_at
      ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Scheduled for ${formatDate(a.scheduled_at)}</span>`
      : '';
    return `
    <div class="border border-gray-200 rounded-xl p-4 ${a.is_published ? '' : 'opacity-60'}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-semibold text-gray-800 text-sm">${a.title}</span>
            ${a.is_published
              ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Published</span>`
              : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Draft</span>`}
            ${scheduledBadge}
          </div>
          <p class="text-gray-600 text-sm whitespace-pre-line">${a.body}</p>
          <p class="text-gray-400 text-xs mt-2">By ${a.author || 'Admin'} · ${formatDate(a.published_at || a.created_at)}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="editAnn(${a.id})"
            class="text-blue-500 hover:text-blue-700 text-sm"><i class="fa-solid fa-pen"></i></button>
          <button onclick="togglePublish(${a.id},${a.is_published})"
            class="text-${a.is_published ? 'yellow' : 'green'}-500 hover:opacity-80 text-sm">
            <i class="fa-solid fa-${a.is_published ? 'eye-slash' : 'eye'}"></i>
          </button>
          <button onclick="deleteAnn(${a.id})" class="text-red-400 hover:text-red-600 text-sm"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateAnnWhenUI() {
  const when = document.querySelector('input[name="ann-when"]:checked').value;
  document.getElementById('ann-scheduled-at').classList.toggle('hidden', when !== 'schedule');
}

async function handleAnnSubmit(e) {
  e.preventDefault();
  const id    = document.getElementById('edit-ann-id').value;
  const title = document.getElementById('ann-title').value.trim();
  const body  = document.getElementById('ann-body').value.trim();
  const when  = document.querySelector('input[name="ann-when"]:checked').value;

  const payload = { title, body, is_published: when === 'now' };
  if (when === 'schedule') {
    const scheduledAt = document.getElementById('ann-scheduled-at').value;
    if (!scheduledAt) { showToast('Pick a date and time to schedule this for.', 'error'); return; }
    payload.scheduled_at = scheduledAt;
  } else if (when === 'draft') {
    payload.scheduled_at = null;
  }

  const btn = document.getElementById('ann-submit-btn');
  btn.disabled = true;

  const res = id
    ? await api.patch(`/announcements/${id}`, payload)
    : await api.post('/announcements', payload);

  btn.disabled = false;
  if (res && res.ok) {
    showToast(id ? 'Announcement updated' : 'Announcement saved');
    resetAnnForm();
    await loadAnnouncements();
  } else {
    showToast('Failed to save announcement', 'error');
  }
}

function editAnn(id) {
  const a = allAnnouncements.find(x => x.id === id);
  if (!a) return;
  document.getElementById('edit-ann-id').value = id;
  document.getElementById('ann-title').value    = a.title;
  document.getElementById('ann-body').value     = a.body;

  const when = a.is_published ? 'now' : (a.scheduled_at ? 'schedule' : 'draft');
  document.querySelector(`input[name="ann-when"][value="${when}"]`).checked = true;
  if (a.scheduled_at) {
    document.getElementById('ann-scheduled-at').value = new Date(a.scheduled_at).toISOString().slice(0, 16);
  }
  updateAnnWhenUI();

  document.getElementById('ann-submit-btn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Update';
  document.getElementById('ann-cancel-btn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetAnnForm() {
  document.getElementById('edit-ann-id').value = '';
  document.getElementById('announcement-form').reset();
  document.querySelector('input[name="ann-when"][value="draft"]').checked = true;
  updateAnnWhenUI();
  document.getElementById('ann-submit-btn').innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> Post';
  document.getElementById('ann-cancel-btn').classList.add('hidden');
}

async function togglePublish(id, current) {
  const res = await api.patch(`/announcements/${id}`, { is_published: current ? 0 : 1 });
  if (res && res.ok) { showToast(current ? 'Unpublished' : 'Published'); await loadAnnouncements(); }
}

async function deleteAnn(id) {
  if (!confirm('Delete this announcement?')) return;
  const res = await api.delete(`/announcements/${id}`);
  if (res && res.ok) { showToast('Deleted'); await loadAnnouncements(); }
}

// Emergency contacts
async function loadContacts() {
  const res = await api.get('/announcements/emergency-contacts');
  const list = res && res.ok ? await res.json() : [];
  const container = document.getElementById('contacts-list');

  if (!list.length) {
    container.innerHTML = `<p class="text-gray-400 text-sm text-center">No contacts yet.</p>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div>
        <p class="text-sm font-medium text-gray-800">${c.label}</p>
        <p class="text-sm text-blue-600 font-mono">${c.phone}</p>
      </div>
      <button onclick="openEditContact(${c.id},'${encodeURIComponent(c.label)}','${c.phone}')"
        class="text-gray-400 hover:text-blue-500 text-sm"><i class="fa-solid fa-pen"></i></button>
    </div>`).join('');
}

function openAddContact() {
  document.getElementById('contact-modal-title').textContent = 'Add Emergency Contact';
  document.getElementById('contact-id').value    = '';
  document.getElementById('contact-label').value = '';
  document.getElementById('contact-phone').value = '';
  document.getElementById('contact-modal').classList.remove('hidden');
}

function openEditContact(id, label, phone) {
  document.getElementById('contact-modal-title').textContent = 'Edit Contact';
  document.getElementById('contact-id').value    = id;
  document.getElementById('contact-label').value = decodeURIComponent(label);
  document.getElementById('contact-phone').value = phone;
  document.getElementById('contact-modal').classList.remove('hidden');
}

async function handleContactSubmit(e) {
  e.preventDefault();
  const id    = document.getElementById('contact-id').value;
  const label = document.getElementById('contact-label').value.trim();
  const phone = document.getElementById('contact-phone').value.trim();

  const res = id
    ? await api.put(`/announcements/emergency-contacts/${id}`, { label, phone })
    : await api.post('/announcements/emergency-contacts', { label, phone });

  if (res && res.ok) {
    showToast('Contact saved');
    closeContactModal();
    await loadContacts();
  } else {
    showToast('Failed to save contact', 'error');
  }
}

function closeContactModal() { document.getElementById('contact-modal').classList.add('hidden'); }
