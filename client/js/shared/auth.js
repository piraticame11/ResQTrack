function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

function requireAuth() {
  const token = localStorage.getItem('accessToken');
  const user  = getUser();
  if (!token || !user) {
    window.location.href = '/pages/shared/login.html';
    return null;
  }
  return user;
}

function requireRole(...roles) {
  const user = requireAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    window.location.href = '/pages/shared/login.html';
    return null;
  }
  return user;
}

function logout() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/pages/shared/login.html';
}

function setUserUI(user) {
  const nameEl   = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl && user) nameEl.textContent = user.name;
  if (avatarEl && user) {
    if (user.profile_photo) {
      avatarEl.innerHTML = `<img src="${user.profile_photo}" class="w-full h-full object-cover rounded-full" alt="">`;
    } else {
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status) {
  const map = {
    Pending:    'badge-pending',
    Dispatched: 'badge-dispatched',
    Ongoing:    'badge-ongoing',
    Resolved:   'badge-resolved',
    Archived:   'badge-archived',
  };
  return `<span class="${map[status] || 'badge-pending'}">${status}</span>`;
}

function triageBadge(color) {
  const map = { Red: 'triage-red', Orange: 'triage-orange', Yellow: 'triage-yellow', Green: 'triage-green' };
  return `<span class="${map[color] || 'triage-yellow'}">${color}</span>`;
}

function typeColor(type) {
  const map = {
    Fire:    'bg-red-100 text-red-700',
    Medical: 'bg-red-100 text-red-700',
    Crime:   'bg-orange-100 text-orange-700',
    Noise:   'bg-yellow-100 text-yellow-700',
    Garbage: 'bg-green-100 text-green-700',
    Other:   'bg-gray-100 text-gray-700',
  };
  return map[type] || 'bg-gray-100 text-gray-700';
}

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('-translate-x-full');
  backdrop && backdrop.classList.toggle('hidden');
}

function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  sidebar.classList.add('-translate-x-full');
  backdrop && backdrop.classList.add('hidden');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  const bg    = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
  toast.className = `fixed bottom-5 right-5 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 transition-opacity duration-300`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
