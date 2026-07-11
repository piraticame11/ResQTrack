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
})();

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Siren sweep: square wave sliding between loFreq and hiFreq over ~5 seconds
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

function showAdminNotification(inc) {
  const typeColors = {
    Fire:    '#ef4444',
    Rescue:  '#ef4444',
    Crime:   '#f97316',
    Noise:   '#eab308',
    Garbage: '#22c55e',
    Other:   '#6366f1',
  };
  const color = typeColors[inc.incident_type] || '#6366f1';

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
