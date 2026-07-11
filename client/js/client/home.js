(async function () {
  const user = requireRole('resident', 'admin', 'responder');
  if (!user) return;
  setUserUI(user);

  const [annRes, contactRes] = await Promise.all([
    api.get('/announcements'),
    api.get('/announcements/emergency-contacts'),
  ]);

  const announcements = annRes     && annRes.ok     ? await annRes.json()     : [];
  const contacts      = contactRes && contactRes.ok ? await contactRes.json() : [];

  renderContacts(contacts);
  renderAnnouncements(announcements);

  // Real-time incident notifications for residents on the home page
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('incident:status_update', ({ reporter_id, reference_no, status, responder_name }) => {
      if (reporter_id && reporter_id !== user.id) return;
      const ref = reference_no ? ` [${reference_no}]` : '';
      const messages = {
        Dispatched: responder_name
          ? `Responder assigned: ${responder_name}`
          : 'A responder has been dispatched to your incident.',
        Initiate: 'Responders are now actively handling your incident.',
        Delayed:  'Your assigned responder reported a delay — they are still on their way.',
        Resolved: 'Your incident has been marked as resolved.',
        Archived: 'Your incident has been archived.',
      };
      homeShowNotification(
        `Incident Update${ref}`,
        messages[status] || `Status changed to ${status}`,
        status
      );
    });
  }
})();

function homeShowNotification(title, body, status) {
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
        <a href="/pages/client/my-reports.html"
           class="text-blue-600 text-xs font-medium mt-1 inline-block hover:underline">View My Reports →</a>
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

function renderContacts(contacts) {
  const accordion = document.getElementById('contacts-accordion');
  if (!contacts.length) {
    accordion.innerHTML = `<p class="text-gray-400 text-sm text-center py-2">No emergency contacts listed.</p>`;
    return;
  }
  accordion.innerHTML = contacts.map((c, i) => `
    <div class="accordion-item">
      <button
        class="w-full flex items-center justify-between py-3 px-1 text-left hover:bg-gray-50 transition-colors rounded-lg focus:outline-none"
        onclick="toggleAccordion(${i})"
        aria-expanded="false"
        aria-controls="acc-body-${i}"
        id="acc-btn-${i}"
      >
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-phone text-red-600 text-xs"></i>
          </div>
          <span class="text-sm font-medium text-gray-800">${c.label}</span>
        </div>
        <i class="fa-solid fa-chevron-down text-gray-400 text-xs transition-transform duration-200" id="acc-icon-${i}"></i>
      </button>
      <div id="acc-body-${i}" class="overflow-hidden max-h-0 transition-all duration-300 ease-in-out">
        <div class="pb-3 px-1 pl-11">
          <a href="tel:${c.phone}" class="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-mono font-semibold text-sm px-4 py-2 rounded-lg transition-colors">
            <i class="fa-solid fa-phone-flip text-xs"></i>${c.phone}
          </a>
        </div>
      </div>
    </div>`).join('');
}

function toggleAccordion(index) {
  const body = document.getElementById(`acc-body-${index}`);
  const icon = document.getElementById(`acc-icon-${index}`);
  const btn  = document.getElementById(`acc-btn-${index}`);
  const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';

  // Close all
  document.querySelectorAll('[id^="acc-body-"]').forEach((el, i) => {
    el.style.maxHeight = '0px';
    document.getElementById(`acc-icon-${i}`).classList.remove('rotate-180');
    document.getElementById(`acc-btn-${i}`).setAttribute('aria-expanded', 'false');
  });

  if (!isOpen) {
    body.style.maxHeight = body.scrollHeight + 'px';
    icon.classList.add('rotate-180');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function renderAnnouncements(list) {
  const container = document.getElementById('announcements-list');
  if (!list.length) {
    container.innerHTML = `<p class="text-gray-400 text-sm text-center py-4">No announcements at this time.</p>`;
    return;
  }
  container.innerHTML = list.map(a => `
    <div class="border-l-4 border-blue-500 pl-4 py-2">
      <p class="font-semibold text-gray-800">${a.title}</p>
      <p class="text-sm text-gray-600 mt-1 whitespace-pre-line">${a.body}</p>
      <p class="text-xs text-gray-400 mt-2">
        <i class="fa-solid fa-calendar mr-1"></i>${formatDate(a.published_at)}
      </p>
    </div>`).join('');
}
