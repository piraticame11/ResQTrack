function fmtMinutes(mins) {
  if (mins == null) return '—';
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.round((mins % 1440) / 60);
  return h > 0 ? `${d} day ${h} hr` : `${d} day`;
}

let _cachedIncidents = [];
let _cachedPerformance = [];

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  const yearSel = document.getElementById('report-year');
  const now     = new Date();

  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }

  document.getElementById('report-month').value = now.getMonth() + 1;
  document.getElementById('report-period').value = 'annual';

  populateWeekSelector();
  onPeriodChange(false);

  await loadReports();
})();

function populateWeekSelector() {
  const sel = document.getElementById('report-week');
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);

  for (let w = 0; w < 12; w++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - w * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    const o = document.createElement('option');
    o.value = start.toISOString().slice(0, 10);
    o.textContent = `${fmt(start)} – ${fmt(end)}`;
    if (w === 0) o.selected = true;
    sel.appendChild(o);
  }
}

function onPeriodChange(reload = true) {
  const period = document.getElementById('report-period').value;
  document.getElementById('wrap-year').classList.toggle('hidden', period === 'weekly');
  document.getElementById('wrap-month').classList.toggle('hidden', period !== 'monthly');
  document.getElementById('wrap-week').classList.toggle('hidden', period !== 'weekly');
  if (reload) loadReports();
}

function getFilters() {
  return {
    type:   document.getElementById('filter-type').value,
    period: document.getElementById('report-period').value,
    year:   document.getElementById('report-year').value,
    month:  document.getElementById('report-month').value,
    week:   document.getElementById('report-week').value,
  };
}

function getPeriodLabel(f = getFilters()) {
  if (f.period === 'weekly' && f.week) {
    const start = new Date(f.week);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    const fmt   = d => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${fmt(start)} – ${fmt(end)}`;
  }
  if (f.period === 'monthly') {
    const mName = new Date(f.year, f.month - 1).toLocaleString('en-PH', { month: 'long' });
    return `${mName} ${f.year}`;
  }
  return `Annual ${f.year}`;
}

function filterIncidents(all, f) {
  return all.filter(i => {
    const d = new Date(i.reported_at);

    if (f.type && i.incident_type !== f.type) return false;

    if (f.period === 'annual') {
      return d.getFullYear() == f.year;
    }
    if (f.period === 'monthly') {
      return d.getFullYear() == f.year && (d.getMonth() + 1) == f.month;
    }
    if (f.period === 'weekly' && f.week) {
      const weekStart = new Date(f.week);
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
      return d >= weekStart && d < weekEnd;
    }
    return true;
  });
}

async function loadReports() {
  const f = getFilters();

  const perfUrl = buildPerfUrl(f);
  const [allRes, perfRes] = await Promise.all([
    api.get('/incidents'),
    api.get(perfUrl),
  ]);

  const all     = allRes  && allRes.ok  ? await allRes.json()  : [];
  const perfData = perfRes && perfRes.ok ? await perfRes.json() : [];

  _cachedIncidents   = all;
  _cachedPerformance = perfData;

  const filtered = filterIncidents(all, f);

  document.getElementById('rpt-total').textContent    = filtered.length;
  document.getElementById('rpt-resolved').textContent = filtered.filter(i => i.status === 'Resolved' || i.status === 'Archived').length;
  document.getElementById('rpt-pending').textContent  = filtered.filter(i => i.status === 'Pending').length;
  document.getElementById('rpt-ongoing').textContent  = filtered.filter(i => ['Dispatched', 'Initiate', 'Delayed'].includes(i.status)).length;

  const label = getPeriodLabel(f) + (f.type ? ` · ${f.type}` : '');
  document.getElementById('incident-period-label').textContent = label;

  renderIncidentsTable(filtered);
  renderPerformanceTable(perfData);
  plotHotspots(filtered);
  loadTypeMonthChart(f.year);
}

// ── Type-by-month comparison ──────────────────────────────────────────────────
let typeMonthChart = null;
const TYPE_MONTH_COLORS = { Fire: '#ef4444', Rescue: '#3b82f6', Crime: '#f97316', Noise: '#eab308', Garbage: '#22c55e', Other: '#6b7280' };

async function loadTypeMonthChart(year) {
  const res = await api.get(`/reports/type-by-month?year=${year}`);
  if (!res || !res.ok) return;
  const data = await res.json();

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const types  = Object.keys(TYPE_MONTH_COLORS);
  const datasets = types.map(type => ({
    label: type,
    backgroundColor: TYPE_MONTH_COLORS[type],
    data: months.map((_, i) => {
      const row = data.find(d => d.month === i + 1 && d.incident_type === type);
      return row ? row.count : 0;
    }),
  }));

  if (typeMonthChart) typeMonthChart.destroy();
  typeMonthChart = new Chart(document.getElementById('type-month-chart'), {
    type: 'bar',
    data: { labels: months, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

// ── Incident hotspot map ─────────────────────────────────────────────────────
let hotspotMap = null;
let hotspotHeatLayer = null;
let hotspotMarkers = [];

function plotHotspots(incidents) {
  if (!hotspotMap) {
    // Starts on the Manay/New Visayas midpoint and zooms to fit whatever
    // incident data actually exists, below.
    hotspotMap = L.map('hotspot-map').setView([7.3269, 125.6352], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(hotspotMap);
  }

  if (hotspotHeatLayer) hotspotMap.removeLayer(hotspotHeatLayer);
  hotspotMarkers.forEach(m => hotspotMap.removeLayer(m));
  hotspotMarkers = [];

  const points = incidents.filter(i => i.latitude && i.longitude);
  hotspotHeatLayer = L.heatLayer(points.map(i => [i.latitude, i.longitude, 0.6]), { radius: 30, blur: 25 }).addTo(hotspotMap);
  if (points.length) hotspotMap.fitBounds(points.map(i => [i.latitude, i.longitude]), { padding: [30, 30], maxZoom: 15 });

  points.forEach(i => {
    const color = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e' }[i.triage_color] || '#6b7280';
    const icon = L.divIcon({
      html: `<div style="background:${color};width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)"></div>`,
      className: '', iconSize: [10, 10],
    });
    const marker = L.marker([i.latitude, i.longitude], { icon })
      .addTo(hotspotMap)
      .bindPopup(`<b>${i.reference_no}</b><br>${i.incident_type} · ${i.purok_name || '—'}`);
    hotspotMarkers.push(marker);
  });

  setTimeout(() => hotspotMap.invalidateSize(), 150);
}

function buildPerfUrl(f) {
  if (f.period === 'monthly') return `/reports/responder-performance?period=monthly&year=${f.year}&month=${f.month}`;
  if (f.period === 'weekly' && f.week) return `/reports/responder-performance?period=weekly&week=${f.week}`;
  return '/reports/responder-performance';
}

function renderIncidentsTable(data) {
  const tbody = document.getElementById('incidents-body');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No incidents found for this period.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(i => {
    const date = new Date(i.reported_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusColor = {
      Pending: 'bg-yellow-100 text-yellow-700',
      Dispatched: 'bg-blue-100 text-blue-700',
      Initiate: 'bg-indigo-100 text-indigo-700',
      Delayed: 'bg-amber-100 text-amber-800',
      Resolved: 'bg-green-100 text-green-700',
      Archived: 'bg-gray-100 text-gray-600',
    }[i.status] || 'bg-gray-100 text-gray-600';
    return `
    <tr class="table-row">
      <td class="px-4 py-3 font-mono text-xs text-gray-700">${i.reference_no}</td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${typeColor(i.incident_type)}">${i.incident_type}</span></td>
      <td class="px-4 py-3"><span class="inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor}">${i.status}</span></td>
      <td class="px-4 py-3 text-gray-600 text-xs">${i.purok_name || '—'}</td>
      <td class="px-4 py-3 text-gray-600 text-xs">${i.reporter_name || '—'}</td>
      <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">${date}</td>
    </tr>`;
  }).join('');
}

function renderPerformanceTable(data) {
  const tbody = document.getElementById('performance-body');
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No responder data available.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => {
    const responseTime   = fmtMinutes(r.avg_response_time_minutes);
    const resolutionTime = fmtMinutes(r.avg_resolution_minutes);
    const rateColor = r.total_assigned > 0
      ? (r.resolved / r.total_assigned >= 0.8 ? 'text-green-600' : r.resolved / r.total_assigned >= 0.5 ? 'text-yellow-600' : 'text-red-500')
      : 'text-gray-400';
    return `
    <tr class="table-row">
      <td class="px-4 py-3 text-sm font-medium text-gray-800">${r.full_name}</td>
      <td class="px-4 py-3 text-center text-gray-600">${r.total_assigned || 0}</td>
      <td class="px-4 py-3 text-center font-medium ${rateColor}">${r.resolved || 0}</td>
      <td class="px-4 py-3 text-center text-blue-600 text-xs font-medium">${responseTime}</td>
      <td class="px-4 py-3 text-center text-gray-600 text-xs">${resolutionTime}</td>
    </tr>`;
  }).join('');
}

function loadImageAsBase64(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function downloadPDF() {
  const logoData = await loadImageAsBase64('/public/images/images.jfif');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const f = getFilters();
  const periodLabel = getPeriodLabel(f);
  const typeLabel   = f.type || 'All Types';
  const generated   = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  const filtered    = filterIncidents(_cachedIncidents, f);

  const total    = filtered.length;
  const resolved = filtered.filter(i => i.status === 'Resolved' || i.status === 'Archived').length;
  const pending  = filtered.filter(i => i.status === 'Pending').length;
  const ongoing  = filtered.filter(i => ['Dispatched', 'Initiate', 'Delayed'].includes(i.status)).length;

  // ── Header ──────────────────────────────────────────────
  const logoSize = 22; // mm, square
  const logoX    = 14;
  const logoY    = 8;
  const textX    = logoX + logoSize + 5;

  if (logoData) {
    doc.addImage(logoData, 'JPEG', logoX, logoY, logoSize, logoSize);
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  doc.text('ResQTrack', textX, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text('Barangay Incident Report', textX, 20);

  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(`Period: ${periodLabel}`, textX, 27);
  doc.text(`Incident Type: ${typeLabel}`, textX, 32);
  doc.text(`Generated: ${generated}`, textX, 37);

  // Divider below header
  const divY = logoY + logoSize + 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(14, divY, 196, divY);

  // ── Summary ──────────────────────────────────────────────
  const summaryStartY = divY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Summary', 14, summaryStartY);

  doc.autoTable({
    startY: summaryStartY + 4,
    head: [['Total Incidents', 'Resolved', 'Pending', 'Dispatched / Initiate / Delayed']],
    body: [[total, resolved, pending, ongoing]],
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 11, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { textColor: [30, 30, 30] },
      1: { textColor: [22, 163, 74] },
      2: { textColor: [202, 138, 4] },
      3: { textColor: [37, 99, 235] },
    },
    margin: { left: 14, right: 14 },
  });

  // ── Incident Records ─────────────────────────────────────
  const incY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Incident Records', 14, incY);

  if (filtered.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('No incidents found for this period.', 14, incY + 8);
  } else {
    doc.autoTable({
      startY: incY + 4,
      head: [['Ref No.', 'Type', 'Status', 'Purok', 'Reporter', 'Date & Time']],
      body: filtered.map(i => [
        i.reference_no,
        i.incident_type,
        i.status,
        i.purok_name   || '—',
        i.reporter_name || '—',
        new Date(i.reported_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 32 }, 5: { cellWidth: 36 } },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Responder Performance ────────────────────────────────
  const perfY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 130) + 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Responder Performance', 14, perfY);

  if (_cachedPerformance.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('No responder data available.', 14, perfY + 8);
  } else {
    doc.autoTable({
      startY: perfY + 4,
      head: [['Responder', 'Assigned', 'Resolved', 'Avg Response Time', 'Avg Resolution Time']],
      body: _cachedPerformance.map(r => [
        r.full_name,
        r.total_assigned || 0,
        r.resolved       || 0,
        fmtMinutes(r.avg_response_time_minutes),
        fmtMinutes(r.avg_resolution_minutes),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
  }

  // ── Footer on every page ─────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`Page ${p} of ${pageCount}`, 196, 289, { align: 'right' });
    doc.text('ResQTrack — Confidential', 14, 289);
  }

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`ResQTrack-Report-${safePeriod}.pdf`);
}

function downloadExcel() {
  const f = getFilters();
  const filtered = filterIncidents(_cachedIncidents, f);

  const incidentRows = filtered.map(i => ({
    'Ref No.':   i.reference_no,
    'Type':      i.incident_type,
    'Status':    i.status,
    'Triage':    i.triage_color,
    'Purok':     i.purok_name || '',
    'Reporter':  i.reporter_name || '',
    'Reported':  new Date(i.reported_at).toLocaleString('en-PH'),
    'Resolved':  i.resolved_at ? new Date(i.resolved_at).toLocaleString('en-PH') : '',
  }));

  const performanceRows = _cachedPerformance.map(r => ({
    'Responder':            r.full_name,
    'Assigned':             r.total_assigned || 0,
    'Resolved':             r.resolved || 0,
    'Avg Response (min)':   r.avg_response_time_minutes ?? '',
    'Avg Resolution (min)': r.avg_resolution_minutes ?? '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidentRows), 'Incidents');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(performanceRows), 'Responder Performance');

  const safePeriod = getPeriodLabel(f).replace(/[^a-zA-Z0-9]/g, '-');
  XLSX.writeFile(wb, `ResQTrack-Report-${safePeriod}.xlsx`);
}
