const report = { incident_type: null, description: '', purok_id: null, latitude: null, longitude: null, photos: [] };
const MAX_PHOTOS = 5;
let currentStep    = 1;
let locationMap    = null;
let locationMarker = null;
let cameraStream   = null;
let facingMode     = 'environment'; // prefer rear camera for evidence

(async function () {
  const user = requireRole('resident', 'admin', 'responder');
  if (!user) return;

  await populatePurokSelect(document.getElementById('purok-select'), { placeholder: '-- Select Purok --' });

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
  if (locationMap) return;
  locationMap = L.map('location-map').setView([7.3456, 125.6022], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
  }).addTo(locationMap);
  locationMap.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng));
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
