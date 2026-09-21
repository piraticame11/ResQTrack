(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  document.getElementById('announcement-form').addEventListener('submit', handleAnnSubmit);
  document.getElementById('contact-form').addEventListener('submit', handleContactSubmit);

  // Live preview bindings
  document.getElementById('ann-title').addEventListener('input', updateLivePreview);
  document.getElementById('ann-body').addEventListener('input', updateLivePreview);
  document.querySelectorAll('input[name="ann-when"]').forEach(r => r.addEventListener('change', updateLivePreview));
  document.getElementById('ann-scheduled-at').addEventListener('input', updateLivePreview);

  updateLivePreview();
  await Promise.all([loadAnnouncements(), loadContacts()]);
})();

let allAnnouncements = [];

function updateLivePreview() {
  const title = document.getElementById('ann-title').value.trim();
  const body  = document.getElementById('ann-body').value.trim();
  const when  = document.querySelector('input[name="ann-when"]:checked')?.value || 'draft';
  const sched = document.getElementById('ann-scheduled-at').value;
  const user  = getUser();

  const titleEl  = document.getElementById('preview-title');
  const bodyEl   = document.getElementById('preview-body');
  const authorEl = document.getElementById('preview-author');
  const dateEl   = document.getElementById('preview-date');
  const badgeEl  = document.getElementById('preview-badge');

  if (titleEl)  titleEl.textContent  = title || 'Announcement title';
  if (bodyEl)   bodyEl.textContent   = body  || 'Announcement content will preview here in real-time as you type…';
  if (authorEl) authorEl.innerHTML    = `<i class="fa-solid fa-user-shield mr-1"></i>${escapeHtml(user?.name || 'Barangay Admin')}`;
  
  if (badgeEl && dateEl) {
    if (when === 'now') {
      badgeEl.className = 'ml-auto inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700';
      badgeEl.textContent = 'Published';
      dateEl.innerHTML = `<i class="fa-solid fa-calendar mr-1"></i>Now`;
    } else if (when === 'schedule') {
      badgeEl.className = 'ml-auto inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700';
      badgeEl.textContent = 'Scheduled';
      dateEl.innerHTML = `<i class="fa-solid fa-calendar mr-1"></i>${sched ? formatDate(sched) : 'Scheduled'}`;
    } else {
      badgeEl.className = 'ml-auto inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600';
      badgeEl.textContent = 'Draft';
      dateEl.innerHTML = `<i class="fa-solid fa-calendar mr-1"></i>Draft`;
    }
  }
}

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
    <div class="border border-gray-200 rounded-xl p-4 ${a.is_published ? '' : 'opacity-70 bg-gray-50/50'}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-semibold text-gray-800 text-sm">${escapeHtml(a.title)}</span>
            ${a.is_published
              ? `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Published</span>`
              : `<span class="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Draft</span>`}
            ${scheduledBadge}
          </div>
          <p class="text-gray-600 text-sm whitespace-pre-line">${escapeHtml(a.body)}</p>
          <p class="text-gray-400 text-xs mt-2">By ${escapeHtml(a.author || 'Admin')} · ${formatDate(a.published_at || a.created_at)}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button onclick="previewAnn(${a.id})"
            class="text-indigo-500 hover:text-indigo-700 text-sm" title="Preview post"><i class="fa-solid fa-eye"></i></button>
          <button onclick="editAnn(${a.id})"
            class="text-blue-500 hover:text-blue-700 text-sm" title="Edit post"><i class="fa-solid fa-pen"></i></button>
          <button onclick="togglePublish(${a.id},${a.is_published})"
            class="text-${a.is_published ? 'yellow' : 'green'}-500 hover:opacity-80 text-sm" title="${a.is_published ? 'Unpublish' : 'Publish'}">
            <i class="fa-solid fa-${a.is_published ? 'eye-slash' : 'paper-plane'}"></i>
          </button>
          <button onclick="deleteAnn(${a.id})" class="text-red-400 hover:text-red-600 text-sm" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateAnnWhenUI() {
  const when = document.querySelector('input[name="ann-when"]:checked').value;
  document.getElementById('ann-scheduled-at').classList.toggle('hidden', when !== 'schedule');
  updateLivePreview();
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
  updateLivePreview();

  document.getElementById('ann-submit-btn').innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Update';
  document.getElementById('ann-cancel-btn').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previewAnn(id) {
  const a = allAnnouncements.find(x => x.id === id);
  if (!a) return;
  document.getElementById('modal-prev-title').textContent = a.title;
  document.getElementById('modal-prev-body').textContent = a.body;
  document.getElementById('modal-prev-meta').innerHTML =
    `<i class="fa-solid fa-user-shield mr-1"></i>${escapeHtml(a.author || 'Admin')} · ${formatDate(a.published_at || a.created_at)}`;
  
  const statusEl = document.getElementById('modal-prev-status');
  if (a.is_published) {
    statusEl.className = 'inline-flex px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700';
    statusEl.textContent = 'Published';
  } else if (a.scheduled_at) {
    statusEl.className = 'inline-flex px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700';
    statusEl.textContent = `Scheduled for ${formatDate(a.scheduled_at)}`;
  } else {
    statusEl.className = 'inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600';
    statusEl.textContent = 'Draft';
  }

  document.getElementById('ann-preview-modal').classList.remove('hidden');
}

function closeAnnPreviewModal() {
  document.getElementById('ann-preview-modal').classList.add('hidden');
}

function resetAnnForm() {
  document.getElementById('edit-ann-id').value = '';
  document.getElementById('announcement-form').reset();
  document.querySelector('input[name="ann-when"][value="draft"]').checked = true;
  updateAnnWhenUI();
  updateLivePreview();
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
        <p class="text-sm font-medium text-gray-800">${escapeHtml(c.label)}</p>
        <p class="text-sm text-blue-600 font-mono">${escapeHtml(c.phone)}</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="openEditContact(${c.id},'${encodeURIComponent(c.label)}','${c.phone}')"
          class="text-gray-400 hover:text-blue-500 text-sm" title="Edit contact"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteContact(${c.id})"
          class="text-gray-400 hover:text-red-500 text-sm" title="Delete contact"><i class="fa-solid fa-trash"></i></button>
      </div>
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

async function deleteContact(id) {
  if (!confirm('Are you sure you want to delete this emergency contact?')) return;
  const res = await api.delete(`/announcements/emergency-contacts/${id}`);
  if (res && res.ok) {
    showToast('Emergency contact deleted');
    await loadContacts();
  } else {
    showToast('Failed to delete emergency contact', 'error');
  }
}

function closeContactModal() { document.getElementById('contact-modal').classList.add('hidden'); }

