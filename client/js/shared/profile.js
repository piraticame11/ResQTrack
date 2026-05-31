const ROLE_COLORS = { admin: 'bg-blue-600', responder: 'bg-green-600', resident: 'bg-blue-500' };
const ROLE_BADGE  = { admin: 'bg-purple-100 text-purple-700', responder: 'bg-green-100 text-green-700', resident: 'bg-blue-100 text-blue-700' };
const ROLE_HOME   = { admin: '/pages/admin/dashboard.html', responder: '/pages/responder/dashboard.html', resident: '/pages/client/home.html' };

let currentProfile = null;

(async () => {
  const user = requireAuth();
  if (!user) return;

  const res = await api.get('/user/profile');
  if (!res || !res.ok) { showToast('Failed to load profile', 'error'); return; }
  currentProfile = await res.json();
  renderProfile(currentProfile);
})();

function renderProfile(p) {
  document.getElementById('profile-name').textContent  = p.full_name;
  document.getElementById('field-name').value          = p.full_name;
  document.getElementById('field-email').value         = p.email;
  document.getElementById('field-phone').value         = p.phone || '';

  const badge = document.getElementById('role-badge');
  badge.textContent  = p.role;
  badge.className    = `inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_BADGE[p.role] || 'bg-gray-100 text-gray-700'}`;

  document.getElementById('profile-since').textContent =
    `Member since ${new Date(p.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}`;

  updateAvatarDisplay(p);
}

function updateAvatarDisplay(p) {
  const avatarEl  = document.getElementById('avatar-display');
  const initialsEl = document.getElementById('avatar-initials');
  const imgEl      = document.getElementById('avatar-img');

  // Reset color classes
  avatarEl.classList.remove('bg-blue-600', 'bg-green-600', 'bg-blue-500');
  avatarEl.classList.add(ROLE_COLORS[p.role] || 'bg-blue-600');

  if (p.profile_photo) {
    imgEl.src = p.profile_photo;
    imgEl.classList.remove('hidden');
    initialsEl.classList.add('hidden');
  } else {
    initialsEl.textContent = (p.full_name || p.name || '?').charAt(0).toUpperCase();
    initialsEl.classList.remove('hidden');
    imgEl.classList.add('hidden');
  }
}

async function uploadPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append('photo', file);

  showToast('Uploading photo…', 'info');
  const res = await api.postForm('/user/profile/photo', fd);
  input.value = '';

  if (!res || !res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.message || 'Photo upload failed', 'error');
    return;
  }

  const data = await res.json();
  currentProfile = { ...currentProfile, profile_photo: data.profile_photo };

  // Persist in localStorage so other pages pick it up
  const stored = getUser();
  stored.profile_photo = data.profile_photo;
  localStorage.setItem('user', JSON.stringify(stored));

  updateAvatarDisplay(currentProfile);
  showToast('Profile photo updated');
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  setLoading(btn, true, '<i class="fa-solid fa-floppy-disk"></i> Save Changes');

  const body = {
    full_name: document.getElementById('field-name').value.trim(),
    phone:     document.getElementById('field-phone').value.trim(),
  };

  const res = await api.patch('/user/profile', body);
  setLoading(btn, false, '<i class="fa-solid fa-floppy-disk"></i> Save Changes');

  if (!res || !res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.message || 'Update failed', 'error');
    return;
  }

  const data = await res.json();
  currentProfile = { ...currentProfile, ...data.user };
  document.getElementById('profile-name').textContent = data.user.full_name;

  // Persist in localStorage
  const stored = getUser();
  stored.name = data.user.full_name;
  localStorage.setItem('user', JSON.stringify(stored));

  showToast('Profile updated successfully');
}

async function changePassword(e) {
  e.preventDefault();
  const newPw     = document.getElementById('field-new-pw').value;
  const confirmPw = document.getElementById('field-confirm-pw').value;

  if (newPw !== confirmPw) {
    showToast('Passwords do not match', 'error');
    return;
  }

  const btn = document.getElementById('pw-btn');
  setLoading(btn, true, '<i class="fa-solid fa-key"></i> Update Password');

  const body = {
    current_password: document.getElementById('field-current-pw').value,
    new_password:     newPw,
  };

  const res = await api.patch('/user/profile', body);
  setLoading(btn, false, '<i class="fa-solid fa-key"></i> Update Password');

  if (!res || !res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.message || 'Password update failed', 'error');
    return;
  }

  document.getElementById('password-form').reset();
  showToast('Password changed successfully');
}

function togglePw(fieldId, btn) {
  const input = document.getElementById(fieldId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText
    ? '<i class="fa-solid fa-eye text-xs"></i>'
    : '<i class="fa-solid fa-eye-slash text-xs"></i>';
}

function setLoading(btn, loading, html) {
  btn.disabled   = loading;
  btn.innerHTML  = loading ? '<i class="fa-solid fa-spinner fa-spin"></i> Please wait…' : html;
}

function goBack() {
  const user = getUser();
  window.location.href = ROLE_HOME[user?.role] || '/pages/shared/login.html';
}
