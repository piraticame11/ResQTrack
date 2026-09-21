// Shared admin real-time notification module.
// Included in every admin page before the page-specific JS.
// Creates one shared socket (window._adminSocket) to avoid duplicate connections.

(function () {
  if (typeof io === 'undefined') return;

  window._adminSocket = io();

  window._adminSocket.on('incident:new', (inc) => {
    playAlertSound();
    showAdminNotification(inc);
  });

  window._adminSocket.on('incident:delayed', (inc) => {
    playDelayedAlertSound();
    showAdminDelayedNotification(inc);
  });

  window._adminSocket.on('incident:stale_initiate', (inc) => {
    playSoftChime();
    showAdminStaleInitiateNotification(inc);
  });
})();

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';

    const loFreq = 660, hiFreq = 1320, cycleLen = 0.40, totalDur = 5.0;
    const now = ctx.currentTime;
    const cycles = Math.ceil(totalDur / cycleLen);

    for (let i = 0; i < cycles; i++) {
      const t = now + i * cycleLen;
      osc.frequency.setValueAtTime(loFreq, t);
      osc.frequency.linearRampToValueAtTime(hiFreq, t + cycleLen * 0.5);
      osc.frequency.linearRampToValueAtTime(loFreq, t + cycleLen);
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.05);
    gain.gain.setValueAtTime(0.7, now + totalDur - 0.3);
    gain.gain.linearRampToValueAtTime(0, now + totalDur);

    osc.start(now);
    osc.stop(now + totalDur);
  } catch (_) {}
}

function playDelayedAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';

    const now = ctx.currentTime;
    // Two-tone warning beep
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(440, now + 0.25);
    osc.frequency.setValueAtTime(880, now + 0.5);
    osc.frequency.setValueAtTime(440, now + 0.75);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain.gain.setValueAtTime(0.5, now + 0.95);
    gain.gain.linearRampToValueAtTime(0, now + 1.1);

    osc.start(now);
    osc.stop(now + 1.1);
  } catch (_) {}
}

function playSoftChime() {
  try {
    // Low volume gentle chime for stale initiate reminders
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';

    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.3); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.6); // G5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05); // Much lowered volume (0.15)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.start(now);
    osc.stop(now + 1.2);
  } catch (_) {}
}

const TYPE_COLORS = {
  Fire:    '#ef4444',
  Rescue:  '#3b82f6',
  Crime:   '#f97316',
  Noise:   '#eab308',
  Other:   '#6b7280',
  'Flagged as Fake': '#6b7280',
};

function showAdminNotification(inc) {
  const color = TYPE_COLORS[inc.incident_type] || '#6b7280';

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:1rem', 'right:1rem',
    'transform:translateX(110%)',
    'z-index:9999', 'width:92vw', 'max-width:360px',
    'opacity:0', 'transition:transform 0.35s ease, opacity 0.35s ease',
  ].join(';');

  el.innerHTML = `
    <div style="border-left:4px solid ${color};background:#fff"
         class="rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <span class="text-2xl shrink-0 mt-0.5">🚨</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-800 text-sm">New Incident Reported</p>
        <p class="text-gray-600 text-xs mt-0.5">
          <span class="font-semibold" style="color:${color}">${inc.incident_type}</span>
          · ${inc.purok_name || 'Unknown Purok'}
        </p>
        <p class="font-mono text-xs text-gray-400 mt-0.5">${inc.reference_no}</p>
        <p class="text-gray-500 text-xs mt-1 line-clamp-2">${inc.description || ''}</p>
        <a href="/pages/admin/incidents.html"
           class="text-blue-600 text-xs font-medium mt-1.5 inline-block hover:underline">
          View Incidents →
        </a>
      </div>
      <button class="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 ml-1"
              onclick="this.closest('div[style]').remove()">×</button>
    </div>`;

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
    el.style.opacity   = '1';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(110%)';
    el.style.opacity   = '0';
    setTimeout(() => el.remove(), 350);
  }, 10000);
}

function showAdminDelayedNotification(inc) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:1rem', 'right:1rem',
    'transform:translateX(110%)',
    'z-index:9999', 'width:92vw', 'max-width:380px',
    'opacity:0', 'transition:transform 0.35s ease, opacity 0.35s ease',
  ].join(';');

  el.innerHTML = `
    <div style="border-left:4px solid #eab308;background:#fff"
         class="rounded-2xl shadow-2xl p-4 flex items-start gap-3 border border-yellow-200">
      <span class="text-2xl shrink-0 mt-0.5">⚠️</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-yellow-800 text-sm">Incident Marked as Delayed</p>
        <p class="text-gray-600 text-xs mt-0.5">
          <span class="font-semibold text-gray-800">${inc.reference_no}</span> · ${inc.incident_type} (${inc.purok_name || 'Manay'})
        </p>
        <p class="text-gray-700 text-xs mt-1">
          <span class="font-medium text-gray-900">Responder:</span> ${inc.responder_name || 'Assigned Responder'}
        </p>
        ${inc.note ? `<p class="text-yellow-700 bg-yellow-50 rounded p-1.5 text-xs mt-1 border border-yellow-100 italic">"${inc.note}"</p>` : ''}
        <a href="/pages/admin/incidents.html"
           class="text-blue-600 text-xs font-medium mt-1.5 inline-block hover:underline">
          Open Incident Details →
        </a>
      </div>
      <button class="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 ml-1"
              onclick="this.closest('div[style]').remove()">×</button>
    </div>`;

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
    el.style.opacity   = '1';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(110%)';
    el.style.opacity   = '0';
    setTimeout(() => el.remove(), 350);
  }, 12000);
}

function showAdminStaleInitiateNotification(inc) {
  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed', 'top:1rem', 'right:1rem',
    'transform:translateX(110%)',
    'z-index:9999', 'width:92vw', 'max-width:380px',
    'opacity:0', 'transition:transform 0.35s ease, opacity 0.35s ease',
  ].join(';');

  el.innerHTML = `
    <div style="border-left:4px solid #3b82f6;background:#fff"
         class="rounded-2xl shadow-2xl p-4 flex items-start gap-3 border border-blue-100">
      <span class="text-2xl shrink-0 mt-0.5">⏳</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-blue-800 text-sm">Action Reminder: Initiated Incident</p>
        <p class="text-gray-600 text-xs mt-0.5">
          <span class="font-semibold text-gray-800">${inc.reference_no}</span> (${inc.incident_type}) has been in <b>Initiate</b> status for over 1 hour without an update.
        </p>
        <p class="text-gray-500 text-xs mt-1">Location: ${inc.purok_name || 'Manay'}</p>
        <div class="flex items-center gap-3 mt-1.5">
          <a href="/pages/admin/incidents.html"
             class="text-blue-600 text-xs font-semibold hover:underline">
            View Incident →
          </a>
        </div>
      </div>
      <button class="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 ml-1"
              onclick="this.closest('div[style]').remove()">×</button>
    </div>`;

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
    el.style.opacity   = '1';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(110%)';
    el.style.opacity   = '0';
    setTimeout(() => el.remove(), 350);
  }, 12000);
}
