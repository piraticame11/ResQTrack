(async function () {
  const user = requireRole('admin', 'responder');
  if (!user) return;
  setUserUI(user);

  // Live clock
  setInterval(() => {
    const el = document.getElementById('live-time');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH');
  }, 1000);

  // Populate year selector
  const yearSel = document.getElementById('year-select');
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }
  yearSel.addEventListener('change', () => loadAnnualChart(yearSel.value));

  let annualChart, typeChart;

  async function loadAll() {
    const [incRes, locRes] = await Promise.all([
      api.get('/incidents'),
      api.get('/responders/locations'),
    ]);

    const incidents = incRes && incRes.ok ? await incRes.json() : [];
    const locations = locRes && locRes.ok ? await locRes.json() : [];

    // Stats
    const today = new Date().toISOString().slice(0, 10);
    const todayInc  = incidents.filter(i => i.reported_at?.slice(0, 10) === today);
    const pending   = incidents.filter(i => i.status === 'Pending');
    const resolved  = incidents.filter(i => i.status === 'Resolved' && i.resolved_at?.slice(0, 10) === today);

    document.getElementById('stat-today').textContent     = todayInc.length;
    document.getElementById('stat-pending').textContent   = pending.length;
    document.getElementById('stat-responders').textContent = locations.length;
    document.getElementById('stat-resolved').textContent  = resolved.length;

    renderRecentTable(incidents.slice(0, 8));
    renderTypeChart(incidents);
    initMap(locations);
    loadAnnualChart(now.getFullYear());
  }

  function renderRecentTable(list) {
    const tbody = document.getElementById('recent-incidents-body');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No incidents yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(i => `
      <tr class="table-row">
        <td class="px-4 py-3 font-mono text-xs text-gray-600">${i.reference_no}</td>
        <td class="px-4 py-3"><span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
        <td class="px-4 py-3 text-gray-600 text-sm">${i.purok_name || '—'}</td>
        <td class="px-4 py-3">${statusBadge(i.status)}</td>
      </tr>`).join('');
  }

  function renderTypeChart(incidents) {
    const counts = {};
    incidents.forEach(i => { counts[i.incident_type] = (counts[i.incident_type] || 0) + 1; });
    const labels = Object.keys(counts);
    const data   = Object.values(counts);
    const colors = ['#ef4444','#3b82f6','#f97316','#eab308','#22c55e','#6b7280'];

    if (typeChart) typeChart.destroy();
    typeChart = new Chart(document.getElementById('type-chart'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } } },
    });
  }

  async function loadAnnualChart(year) {
    const res  = await api.get(`/reports/annual?year=${year}`);
    if (!res || !res.ok) return;
    const data = await res.json();

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const counts = new Array(12).fill(0);
    data.forEach(r => { counts[r.month - 1] = r.count; });

    if (annualChart) annualChart.destroy();
    annualChart = new Chart(document.getElementById('annual-chart'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{ label: 'Incidents', data: counts, backgroundColor: '#3b82f6', borderRadius: 6 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  function initMap(locations) {
    if (window._dashMap) { window._dashMap.remove(); }
    // Centers on wherever responders actually are (fitBounds below);
    // falls back to the Manay/New Visayas midpoint when no one is tracked yet.
    const map = L.map('responder-map').setView([7.3269, 125.6352], 12);
    window._dashMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const points = [];
    locations.forEach(loc => {
      L.marker([loc.latitude, loc.longitude])
        .addTo(map)
        .bindPopup(`<b>${loc.responder_name}</b><br>Responder`);
      points.push([loc.latitude, loc.longitude]);
    });
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
  }

  // Socket.IO — uses the shared socket created by notify.js
  const socket = window._adminSocket;
  socket.emit('join:admin');
  socket.on('incident:new', (inc) => {
    // Update stats counter
    const stat = document.getElementById('stat-today');
    if (stat) stat.textContent = parseInt(stat.textContent || 0) + 1;
    // Prepend to recent incidents table
    const tbody = document.getElementById('recent-incidents-body');
    if (tbody) {
      const row = document.createElement('tr');
      row.className = 'table-row';
      row.innerHTML = `
        <td class="px-4 py-3 font-mono text-xs text-gray-600">${inc.reference_no}</td>
        <td class="px-4 py-3"><span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor(inc.incident_type)}">${inc.incident_type}</span></td>
        <td class="px-4 py-3 text-gray-600 text-sm">${inc.purok_name || '—'}</td>
        <td class="px-4 py-3">${statusBadge(inc.status)}</td>`;
      tbody.prepend(row);
    }
  });
  socket.on('responder:location_update', (data) => {
    if (window._dashMap) {
      L.marker([data.latitude, data.longitude])
        .addTo(window._dashMap)
        .bindPopup(`<b>${data.name}</b>`);
    }
  });

  await loadAll();
})();
