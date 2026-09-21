const report = { incident_type: null, description: '', purok_id: null, latitude: null, longitude: null, photos: [] };
const MAX_PHOTOS = 5;
let currentStep    = 1;
let locationMap    = null;
let locationMarker = null;
let cameraStream   = null;
let facingMode     = 'environment'; // prefer rear camera for evidence

const LEGEND_TRANSLATIONS = {
  en: {
    title: 'Incident Guide & Priority',
    types: [
      { name: '🔥 Fire', prio: 'Red (Urgent)', desc: 'Structure fire, grass fire, electrical fire or gas leak.' },
      { name: '🚑 Rescue', prio: 'Red (Urgent)', desc: 'Severe medical emergency, entrapment, collapse, drowning.' },
      { name: '🚔 Crime', prio: 'Orange (High)', desc: 'Theft, robbery, vandalism, trespassing, or illegal activities.' },
      { name: '🥊 Fights', prio: 'Orange (High)', desc: 'Physical brawl, altercation, riot, or domestic violence.' },
      { name: '🌊 Flood', prio: 'Orange (High)', desc: 'Rising flood waters, blocked drainage overflow, flash flood.' },
      { name: '🔍 Missing', prio: 'Yellow (Moderate)', desc: 'Lost child, missing person, dementia patient wander.' },
      { name: '📢 Noise', prio: 'Yellow (Moderate)', desc: 'Loud karaoke, late night disturbances, excessive sound.' },
      { name: '❗ Others', prio: 'Green (Standard)', desc: 'Garbage/sanitation, fallen trees, road obstruction, or other general concerns.' },
    ],
  },
  ceb: {
    title: 'Giya sa Insidente ug Priyoridad',
    types: [
      { name: '🔥 Sunog (Fire)', prio: 'Pula (Labing dinalian)', desc: 'Sunog sa balay, sagbot, kuryente o gas leak.' },
      { name: '🚑 Pagluwas (Rescue)', prio: 'Pula (Labing dinalian)', desc: 'Kritikal nga medikal nga emerhensya, natanggong, pagkalumos.' },
      { name: '🚔 Krimen (Crime)', prio: 'Kahel (Taas)', desc: 'Kawat, pagpanglungkab, pagsulod nga walay pananghid, ilegal nga buhat.' },
      { name: '🥊 Away / Sumbagay (Fights)', prio: 'Kahel (Taas)', desc: 'Sumbagay, kasamok, away sa dalan o pamilya.' },
      { name: '🌊 Baha (Flood)', prio: 'Kahel (Taas)', desc: 'Pagsaka sa tubig-baha, baradong kanal, kalit nga pagbaha.' },
      { name: '🔍 Nawala (Missing)', prio: 'Dalag (Kasagaran)', desc: 'Nawalang bata, paryente, o tigulang.' },
      { name: '📢 Saba / Kasaba (Noise)', prio: 'Dalag (Kasagaran)', desc: 'Saba nga videoke, kasaba sa gabii, saba nga tambutso.' },
      { name: '❗ Ubang Kabalaka (Others)', prio: 'Berde (Standard)', desc: 'Basura, nahulog nga kahoy, babag sa dalan, o uban pang kabalaka.' },
    ],
  },
};

let currentLegendLang = 'en';

function setLegendLanguage(lang) {
  currentLegendLang = lang;
  const enBtn = document.getElementById('lang-btn-en');
  const cebBtn = document.getElementById('lang-btn-ceb');

  if (enBtn && cebBtn) {
    if (lang === 'en') {
      enBtn.className = 'px-2 py-1 rounded bg-blue-600 text-white transition-colors';
      cebBtn.className = 'px-2 py-1 rounded text-gray-600 hover:text-gray-900 transition-colors';
    } else {
      enBtn.className = 'px-2 py-1 rounded text-gray-600 hover:text-gray-900 transition-colors';
      cebBtn.className = 'px-2 py-1 rounded bg-blue-600 text-white transition-colors';
    }
  }

  renderLegendGuide();
}

function renderLegendGuide() {
  const container = document.getElementById('legend-content-list');
  const titleEl = document.getElementById('legend-guide-title');
  if (!container) return;

  const data = LEGEND_TRANSLATIONS[currentLegendLang] || LEGEND_TRANSLATIONS.en;
  if (titleEl) titleEl.textContent = data.title;

  container.innerHTML = data.types.map(t => `
    <div class="bg-white rounded-lg p-2.5 border border-gray-200 shadow-sm">
      <div class="flex items-center justify-between mb-1">
        <span class="font-bold text-gray-800 text-xs">${t.name}</span>
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">${t.prio}</span>
      </div>
      <p class="text-gray-500 text-[11px] leading-tight">${t.desc}</p>
    </div>
  `).join('');
}

(async function () {
  const user = requireRole('resident', 'admin', 'responder');
  if (!user) return;
  setUserUI(user);

  await populatePurokSelect(document.getElementById('purok-select'), { placeholder: '-- Select Purok --' });
  renderLegendGuide();

  updateOfflineBanner();
  window.addEventListener('online',  updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
})();

function updateOfflineBanner() {
  document.getElementById('offline-banner').classList.toggle('hidden', navigator.onLine);
}

// ── Fire fast-path ──────────────────────────────────────────────────────────

async function showFireBanner() {
  const res = await fetch('/api/announcements/emergency-contacts').catch(() => null);
  const contacts = res && res.ok ? await res.json() : [];
  const bfp = contacts.find(c => /fire/i.test(c.label));
  if (bfp) document.getElementById('fire-call-link').href = `tel:${bfp.phone}`;
  document.getElementById('fire-banner').classList.remove('hidden');
}

function dismissFireBanner() {
  document.getElementById('fire-banner').classList.add('hidden');
  goToStep(2);
}

// ── Others sub-choice ────────────────────────────────────────────────────────

function showOthersModal() {
  document.getElementById('others-modal').classList.remove('hidden');
}

function chooseOthersType(actualType) {
  report.incident_type = actualType;
  document.getElementById('others-modal').classList.add('hidden');
  goToStep(2);
}

// ── Camera ──────────────────────────────────────────────────────────────────

async function openCamera() {
  if (report.photos.length >= MAX_PHOTOS) {
    showToast(`You can attach up to ${MAX_PHOTOS} photos.`, 'error');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera is not available on this device or browser.', 'error');
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    document.getElementById('camera-feed').srcObject = cameraStream;
    document.getElementById('camera-idle').classList.add('hidden');
    document.getElementById('camera-active').classList.remove('hidden');
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'Camera permission denied. Please allow camera access and try again.'
      : 'Could not access camera. Make sure no other app is using it.';
    showToast(msg, 'error');
  }
}

async function flipCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  stopCameraStream();
  await openCamera();
}

function capturePhoto() {
  const video  = document.getElementById('camera-feed');
  const canvas = document.getElementById('capture-canvas');
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    if (!blob) { showToast('Capture failed, try again.', 'error'); return; }
    addPhoto(new File([blob], `evidence-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    stopCameraStream();
    document.getElementById('camera-active').classList.add('hidden');
    renderPhotoStrip();
  }, 'image/jpeg', 0.92);
}

function closeCamera() {
  stopCameraStream();
  document.getElementById('camera-active').classList.add('hidden');
  renderPhotoStrip();
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const feed = document.getElementById('camera-feed');
  if (feed) feed.srcObject = null;
}

// ── Gallery picker ───────────────────────────────────────────────────────────

function handleGalleryPick(event) {
  const files = Array.from(event.target.files || []);
  const room  = MAX_PHOTOS - report.photos.length;
  if (files.length > room) {
    showToast(`Only ${room} more photo(s) can be added (max ${MAX_PHOTOS}).`, 'error');
  }
  files.slice(0, room).forEach(f => addPhoto(f));
  event.target.value = '';
  renderPhotoStrip();
}

function addPhoto(file) {
  report.photos.push({ file, url: URL.createObjectURL(file) });
}

function removePhoto(index) {
  URL.revokeObjectURL(report.photos[index].url);
  report.photos.splice(index, 1);
  renderPhotoStrip();
}

function renderPhotoStrip() {
  const strip   = document.getElementById('photo-strip');
  const actions = document.getElementById('photo-strip-actions');
  const idle    = document.getElementById('camera-idle');

  if (!report.photos.length) {
    strip.classList.add('hidden');
    actions.classList.add('hidden');
    idle.classList.remove('hidden');
    return;
  }

  idle.classList.add('hidden');
  strip.classList.remove('hidden');
  actions.classList.remove('hidden');
  strip.innerHTML = report.photos.map((p, i) => `
    <div class="relative rounded-lg overflow-hidden border border-gray-300 aspect-square">
      <img src="${p.url}" class="w-full h-full object-cover">
      <button type="button" onclick="removePhoto(${i})"
        class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>`).join('');

  const room = report.photos.length >= MAX_PHOTOS;
  document.getElementById('add-more-camera-btn').classList.toggle('hidden', room);
  document.getElementById('add-more-gallery-btn').classList.toggle('hidden', room);
}

// ── Map ──────────────────────────────────────────────────────────────────────

function showLocationMap() {
  const container = document.getElementById('location-map');
  if (!container) return;
  if (locationMap) {
    setTimeout(() => locationMap.invalidateSize(), 150);
    return;
  }
  if (container._leaflet_id) {
    container._leaflet_id = null;
  }
  locationMap = L.map('location-map').setView([7.3269, 125.6352], 12);
  window.locationMap = locationMap;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(locationMap);
  locationMap.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng));

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => { if (!report.latitude && locationMap) locationMap.setView([pos.coords.latitude, pos.coords.longitude], 15); },
      () => {},
      { maximumAge: 60000 }
    );
  }
  setTimeout(() => { if (locationMap) locationMap.invalidateSize(); }, 200);
}

function setLocation(lat, lng) {
  report.latitude  = lat;
  report.longitude = lng;
  document.getElementById('location-info').textContent = `GPS set: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  if (locationMarker) locationMarker.remove();
  locationMarker = L.marker([lat, lng]).addTo(locationMap).bindPopup('Incident location').openPopup();
  locationMap.setView([lat, lng], 15);
}

function autoDetectLocation() {
  if (!navigator.geolocation) {
    document.getElementById('location-info').textContent = 'Geolocation is not supported by your browser.';
    return;
  }
  document.getElementById('location-info').textContent = 'Detecting location…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      showLocationMap();
      setLocation(pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      document.getElementById('location-info').textContent = 'Could not detect location. Please tap the map.';
    }
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

function selectType(type) {
  report.incident_type = type;
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('border-blue-500', 'bg-blue-50'));
  event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
  if (type === 'Fire') { showFireBanner(); return; }
  if (type === 'Others') { showOthersModal(); return; }
  setTimeout(() => goToStep(2), 300);
}

function goToStep(step) {
  if (step === 2 && !report.incident_type) {
    showToast('Please select an incident type', 'error'); return;
  }
  if (step === 3) {
    const desc = document.getElementById('description').value.trim();
    if (!desc) { showToast('Please describe the incident', 'error'); return; }
    report.description = desc;
    report.purok_id    = document.getElementById('purok-select').value || null;
  }
  if (step === 4) fillReview();

  // Stop camera when leaving step 3
  if (currentStep === 3 && step !== 3) stopCameraStream();

  [1, 2, 3, 4].forEach(s => document.getElementById(`step-${s}`).classList.add('hidden'));
  document.getElementById(`step-${step}`).classList.remove('hidden');
  currentStep = step;

  // Update step indicators
  document.querySelectorAll('.step-dot').forEach(dot => {
    const s      = parseInt(dot.dataset.step);
    const circle = dot.querySelector('.step-circle');
    const label  = dot.querySelector('span');
    if (s < step) {
      circle.className  = 'w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm step-circle';
      circle.innerHTML  = '<i class="fa-solid fa-check text-sm"></i>';
      label.className   = 'text-xs text-green-600 font-medium mt-1';
    } else if (s === step) {
      circle.className  = 'w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm step-circle';
      circle.textContent = s;
      label.className   = 'text-xs text-blue-600 font-medium mt-1';
    } else {
      circle.className  = 'w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-sm step-circle';
      circle.textContent = s;
      label.className   = 'text-xs text-gray-400 font-medium mt-1';
    }
  });
  document.querySelectorAll('.step-line').forEach(line => {
    const after = parseInt(line.dataset.after);
    line.className = after < step
      ? 'w-12 h-0.5 bg-blue-500 step-line mx-1'
      : 'w-12 h-0.5 bg-gray-300 step-line mx-1';
  });

  if (step === 3) {
    setTimeout(() => { showLocationMap(); if (locationMap) locationMap.invalidateSize(); }, 100);
  }
}

function fillReview() {
  const purokText = report.purok_id ? document.getElementById('purok-select').selectedOptions[0]?.textContent : 'Not selected';
  document.getElementById('review-type').textContent        = report.incident_type;
  document.getElementById('review-purok').textContent       = purokText;
  document.getElementById('review-description').textContent = report.description;
  document.getElementById('review-gps').textContent         = report.latitude
    ? `${parseFloat(report.latitude).toFixed(6)}, ${parseFloat(report.longitude).toFixed(6)}`
    : 'Not set';
  document.getElementById('review-photo').textContent       = report.photos.length ? `${report.photos.length} photo(s) attached ✓` : 'None';
}

// ── Submit ────────────────────────────────────────────────────────────────────

function buildFormData() {
  const fd = new FormData();
  fd.append('incident_type', report.incident_type);
  fd.append('description',   report.description);
  if (report.purok_id)  fd.append('purok_id',  report.purok_id);
  if (report.latitude)  fd.append('latitude',  report.latitude);
  if (report.longitude) fd.append('longitude', report.longitude);
  report.photos.forEach(p => fd.append('photos', p.file));
  return fd;
}

async function submitReport() {
  const btn   = document.getElementById('submit-btn');
  const errEl = document.getElementById('submit-error');
  errEl.classList.add('hidden');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Submitting…';

  if (!navigator.onLine) {
    await queueOffline();
    return;
  }

  try {
    const res  = await api.postForm('/incidents', buildFormData());
    const data = res ? await res.json() : null;
    if (!res || !res.ok) throw new Error(data?.message || 'Submission failed');
    showSuccess(data.incident.reference_no);
  } catch (err) {
    // Network failure (not a validation error) — fall back to the offline queue
    if (err instanceof TypeError) {
      await queueOffline();
      return;
    }
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Submit Report';
  }
}

async function queueOffline() {
  const photos = await Promise.all(report.photos.map(p => fileToDataUrl(p.file)));
  const entry = {
    id: `local-${Date.now()}`,
    incident_type: report.incident_type,
    description:   report.description,
    purok_id:      report.purok_id,
    latitude:      report.latitude,
    longitude:     report.longitude,
    photos,
    queued_at: new Date().toISOString(),
  };
  const queue = JSON.parse(localStorage.getItem('resqtrack_offline_queue') || '[]');
  queue.push(entry);
  localStorage.setItem('resqtrack_offline_queue', JSON.stringify(queue));

  [1, 2, 3, 4].forEach(s => document.getElementById(`step-${s}`).classList.add('hidden'));
  document.getElementById('step-success').classList.remove('hidden');
  document.querySelector('#step-success h2').textContent = 'Saved Offline';
  document.querySelector('#step-success p').textContent =
    "You're offline. This report is saved on your device and will be submitted automatically as soon as you're back online.";
  document.getElementById('success-ref').textContent = '(pending — no reference number yet)';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showSuccess(refNo) {
  [1, 2, 3, 4].forEach(s => document.getElementById(`step-${s}`).classList.add('hidden'));
  document.getElementById('step-success').classList.remove('hidden');
  document.getElementById('success-ref').textContent = refNo;
}
