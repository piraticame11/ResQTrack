const report = { incident_type: null, description: '', purok_id: null, latitude: null, longitude: null, photo: null };
let currentStep    = 1;
let locationMap    = null;
let locationMarker = null;
let cameraStream   = null;
let facingMode     = 'environment'; // prefer rear camera for evidence

(async function () {
  const user = requireRole('resident', 'admin', 'responder');
  if (!user) return;

  const purokSel = document.getElementById('purok-select');
  for (let i = 1; i <= 14; i++) {
    const o = document.createElement('option'); o.value = i; o.textContent = `Purok ${i}`;
    purokSel.appendChild(o);
  }
})();

// ── Camera ──────────────────────────────────────────────────────────────────

async function openCamera() {
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
    report.photo = new File([blob], `evidence-${Date.now()}.jpg`, { type: 'image/jpeg' });
    document.getElementById('photo-preview').src = URL.createObjectURL(blob);
    stopCameraStream();
    document.getElementById('camera-active').classList.add('hidden');
    document.getElementById('camera-captured').classList.remove('hidden');
  }, 'image/jpeg', 0.92);
}

function retakePhoto() {
  report.photo = null;
  document.getElementById('camera-captured').classList.add('hidden');
  document.getElementById('camera-idle').classList.remove('hidden');
}

function closeCamera() {
  stopCameraStream();
  document.getElementById('camera-active').classList.add('hidden');
  document.getElementById('camera-idle').classList.remove('hidden');
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const feed = document.getElementById('camera-feed');
  if (feed) feed.srcObject = null;
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
  const purokText = report.purok_id ? `Purok ${report.purok_id}` : 'Not selected';
  document.getElementById('review-type').textContent        = report.incident_type;
  document.getElementById('review-purok').textContent       = purokText;
  document.getElementById('review-description').textContent = report.description;
  document.getElementById('review-gps').textContent         = report.latitude
    ? `${parseFloat(report.latitude).toFixed(6)}, ${parseFloat(report.longitude).toFixed(6)}`
    : 'Not set';
  document.getElementById('review-photo').textContent       = report.photo ? 'Photo captured ✓' : 'None';
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitReport() {
  const btn   = document.getElementById('submit-btn');
  const errEl = document.getElementById('submit-error');
  errEl.classList.add('hidden');
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Submitting…';

  try {
    const fd = new FormData();
    fd.append('incident_type', report.incident_type);
    fd.append('description',   report.description);
    if (report.purok_id)  fd.append('purok_id',  report.purok_id);
    if (report.latitude)  fd.append('latitude',  report.latitude);
    if (report.longitude) fd.append('longitude', report.longitude);
    if (report.photo)     fd.append('photo',     report.photo);

    const res  = await api.postForm('/incidents', fd);
    const data = res ? await res.json() : null;
    if (!res || !res.ok) throw new Error(data?.message || 'Submission failed');

    [1, 2, 3, 4].forEach(s => document.getElementById(`step-${s}`).classList.add('hidden'));
    document.getElementById('step-success').classList.remove('hidden');
    document.getElementById('success-ref').textContent = data.incident.reference_no;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-exclamation mr-1"></i> Submit Report';
  }
}
