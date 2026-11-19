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
  await populatePurokSelector('filter-purok', 'All Puroks');
  await populateResponderSelector();
  onPeriodChange(false);

  await loadReports();
})();

async function populateResponderSelector() {
  const sel = document.getElementById('filter-responder');
  if (!sel) return;
  const res = await api.get('/responders');
  if (res && res.ok) {
    const list = await res.json();
    list.forEach(r => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.full_name;
      sel.appendChild(o);
    });
  }
}

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
    type:      document.getElementById('filter-type').value,
    responder: document.getElementById('filter-responder')?.value || '',
    purok_id:  document.getElementById('filter-purok')?.value || '',
    period:    document.getElementById('report-period').value,
    year:      document.getElementById('report-year').value,
    month:     document.getElementById('report-month').value,
    week:      document.getElementById('report-week').value,
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
    if (f.purok_id && i.purok_id != f.purok_id) return false;
    if (f.responder && i.assigned_responder_id != f.responder) return false;

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
  document.getElementById('rpt-ongoing').textContent  = filtered.filter(i => ['Assigned', 'Initiate', 'Delayed'].includes(i.status)).length;

  const label = getPeriodLabel(f) + (f.type ? ` · ${f.type}` : '');
  document.getElementById('incident-period-label').textContent = label;

  renderIncidentsTable(filtered);
  renderPerformanceTable(perfData);
  plotHotspots(filtered);
  loadTypeMonthChart(f.year, f.type);
}

function clearReports() {
  document.getElementById('filter-type').value = '';
  if (document.getElementById('filter-responder')) document.getElementById('filter-responder').value = '';
  if (document.getElementById('filter-purok')) document.getElementById('filter-purok').value = '';
  document.getElementById('report-period').value = 'annual';
  onPeriodChange(false);

  _cachedIncidents = [];
  _cachedPerformance = [];

  document.getElementById('rpt-total').textContent    = '—';
  document.getElementById('rpt-resolved').textContent = '—';
  document.getElementById('rpt-pending').textContent  = '—';
  document.getElementById('rpt-ongoing').textContent  = '—';
  document.getElementById('incident-period-label').textContent = 'Selection cleared';

  document.getElementById('incidents-body').innerHTML = `
    <tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">No report data selected. Use the filters above and click Refresh to generate report.</td></tr>`;
  document.getElementById('performance-body').innerHTML = `
    <tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No responder data selected.</td></tr>`;

  if (hotspotMap) {
    if (hotspotHeatLayer) hotspotMap.removeLayer(hotspotHeatLayer);
    hotspotMarkers.forEach(m => hotspotMap.removeLayer(m));
    hotspotMarkers = [];
    hotspotHeatLayer = null;
    hotspotMap.setView([7.3269, 125.6352], 12);
  }

  if (typeMonthChart) {
    typeMonthChart.destroy();
    typeMonthChart = null;
  }
}

// ── Type-by-month comparison ──────────────────────────────────────────────────
let typeMonthChart = null;
const TYPE_MONTH_COLORS = {
  Fire:    '#ef4444',
  Rescue:  '#3b82f6',
  Crime:   '#f97316',
  Fights:  '#991b1b',
  Flood:   '#06b6d4',
  Missing: '#a855f7',
  Noise:   '#eab308',
  Other:   '#6b7280',
};

async function loadTypeMonthChart(year, selectedType = '') {
  const res = await api.get(`/reports/type-by-month?year=${year}`);
  if (!res || !res.ok) return;
  const data = await res.json();

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const types  = selectedType ? [selectedType] : Object.keys(TYPE_MONTH_COLORS);
  const datasets = types.map(type => ({
    label: type,
    backgroundColor: TYPE_MONTH_COLORS[type] || '#6b7280',
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
  const container = document.getElementById('hotspot-map');
  if (!container) return;

  if (!hotspotMap) {
    if (container._leaflet_id) {
      container._leaflet_id = null;
    }
    hotspotMap = L.map('hotspot-map').setView([7.3269, 125.6352], 12);
    window.hotspotMap = hotspotMap;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(hotspotMap);
  } else {
    window.hotspotMap = hotspotMap;
  }

  if (hotspotHeatLayer) {
    try { hotspotMap.removeLayer(hotspotHeatLayer); } catch (_) {}
    hotspotHeatLayer = null;
  }
  hotspotMarkers.forEach(m => {
    try { hotspotMap.removeLayer(m); } catch (_) {}
  });
  hotspotMarkers = [];

  const points = (incidents || []).filter(i => i && i.latitude && i.longitude);

  if (points.length) {
    if (typeof L.heatLayer === 'function') {
      hotspotHeatLayer = L.heatLayer(points.map(i => [i.latitude, i.longitude, 1]), {
        radius: 35,
        blur: 22,
        minOpacity: 0.45,
        max: Math.max(2, Math.ceil(points.length / 4)),
      }).addTo(hotspotMap);
    }
    hotspotMap.fitBounds(points.map(i => [i.latitude, i.longitude]), { padding: [30, 30], maxZoom: 15 });
  } else {
    hotspotMap.setView([7.3269, 125.6352], 12);
  }

  points.forEach(i => {
    // Match color coding of the incident type with the dots on the map
    const color = TYPE_MONTH_COLORS[i.incident_type] || '#6b7280';
    const icon = L.divIcon({
      html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.6)"></div>`,
      className: '', iconSize: [12, 12],
    });
    const marker = L.marker([i.latitude, i.longitude], { icon })
      .addTo(hotspotMap)
      .bindPopup(`<b>${i.reference_no}</b><br><span style="color:${color};font-weight:bold;">${i.incident_type}</span> · ${i.purok_name || '—'}<br><span style="font-size:11px;color:#718096;">Status: ${i.status}</span>`);
    hotspotMarkers.push(marker);
  });

  setTimeout(() => hotspotMap && hotspotMap.invalidateSize(), 150);
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
      Assigned: 'bg-blue-100 text-blue-700',
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
  const f = getFilters();
  let list = data;
  if (f.responder) {
    list = list.filter(r => r.id == f.responder);
  }
  const tbody = document.getElementById('performance-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No responder data available.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => {
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

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let cachedTemplateBaseData = null;
let cachedLogoData = null;
let cachedTenantLoaded = null;
let activeReportBlobUrl = null;
let activeReportDoc = null;
let activeReportFileName = '';
let isUpdatingPreview = false;

function getExportSections() {
  return {
    includeSummary: document.getElementById('export-sec-summary')?.checked ?? true,
    includeIncidents: document.getElementById('export-sec-incidents')?.checked ?? true,
    includeResponders: document.getElementById('export-sec-responders')?.checked ?? true,
    includeSignatures: document.getElementById('export-sec-signatures')?.checked ?? true,
  };
}

function setAllExportSections(checked) {
  ['export-sec-summary', 'export-sec-incidents', 'export-sec-responders', 'export-sec-signatures'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(checked);
  });
  updateReportPreview();
}

function openReportExportModal() {
  const modal = document.getElementById('report-export-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  updateReportPreview();
}

function closeReportExportModal() {
  const modal = document.getElementById('report-export-modal');
  if (modal) modal.classList.add('hidden');
}

async function updateReportPreview() {
  if (isUpdatingPreview) return;
  isUpdatingPreview = true;

  const canvas = document.getElementById('report-preview-canvas');
  const statsEl = document.getElementById('report-preview-stats');
  const btnTab = document.getElementById('btn-report-tab');
  const btnPrint = document.getElementById('btn-report-print');
  const btnDownload = document.getElementById('btn-report-download');

  const sections = getExportSections();
  const anyChecked = sections.includeSummary || sections.includeIncidents || sections.includeResponders || sections.includeSignatures;

  if (!anyChecked) {
    if (activeReportBlobUrl) {
      URL.revokeObjectURL(activeReportBlobUrl);
      activeReportBlobUrl = null;
    }
    if (canvas) {
      canvas.innerHTML = `
        <div class="p-8 text-center text-gray-500">
          <i class="fa-solid fa-square-check text-4xl text-gray-400 mb-3 block"></i>
          <p class="font-semibold text-gray-800 text-base">No sections selected</p>
          <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Please select at least one section above to generate and export your report.</p>
        </div>
      `;
    }
    if (statsEl) statsEl.innerHTML = `<span class="text-amber-600 flex items-center gap-1.5 font-medium"><i class="fa-solid fa-triangle-exclamation"></i>Select at least one section</span>`;
    if (btnTab) btnTab.disabled = true;
    if (btnPrint) btnPrint.disabled = true;
    if (btnDownload) btnDownload.disabled = true;
    isUpdatingPreview = false;
    return;
  }

  if (btnTab) btnTab.disabled = false;
  if (btnPrint) btnPrint.disabled = false;
  if (btnDownload) btnDownload.disabled = false;

  if (canvas && !activeReportBlobUrl) {
    canvas.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-gray-600">
        <i class="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600 mb-3"></i>
        <p class="font-medium text-sm text-gray-800">Rendering PDF preview…</p>
        <p class="text-xs text-gray-400 mt-1">Applying layout, headers, and section tables</p>
      </div>
    `;
  }

  try {
    const result = await buildReportPdf(sections);
    if (activeReportBlobUrl) {
      URL.revokeObjectURL(activeReportBlobUrl);
    }
    activeReportBlobUrl = result.blobUrl;
    activeReportDoc = result.doc;
    activeReportFileName = result.fileName;

    if (canvas) {
      canvas.innerHTML = `
        <div class="w-full h-full flex flex-col flex-1 min-h-[66vh]">
          <iframe id="report-preview-frame" src="${activeReportBlobUrl}#toolbar=0&navpanes=0" class="w-full flex-1 min-h-[68vh] rounded-lg border border-gray-300 shadow-md bg-white" title="Report PDF Preview"></iframe>
          <div class="mt-2 text-center text-xs text-gray-500">
            Previewing: <span class="text-gray-700 font-mono font-medium">${escapeHtml(result.fileName)}</span> · ${result.pageCount} page(s)
          </div>
        </div>
      `;
    }

    if (statsEl) {
      statsEl.innerHTML = `
        <i class="fa-solid fa-circle-check text-emerald-600"></i>
        <span class="text-gray-700 font-medium">${result.totalIncidents} incident(s) · ${result.totalResponders} responder(s) · ${result.pageCount} page(s) ready</span>
      `;
    }
  } catch (err) {
    console.error('Error generating PDF report preview:', err);
    if (canvas) {
      canvas.innerHTML = `
        <div class="p-8 text-center text-red-500">
          <i class="fa-solid fa-circle-exclamation text-3xl mb-2 block"></i>
          <p class="font-semibold text-gray-800">Failed to render report preview</p>
          <p class="text-xs text-gray-500 mt-1">${escapeHtml(err.message)}</p>
        </div>
      `;
    }
    if (statsEl) statsEl.innerHTML = `<span class="text-red-500 font-medium">Error generating preview</span>`;
  } finally {
    isUpdatingPreview = false;
  }
}

function openReportPdfTab() {
  if (activeReportBlobUrl) {
    window.open(activeReportBlobUrl, '_blank');
  }
}

function printReportPdf() {
  const frame = document.getElementById('report-preview-frame');
  if (frame && frame.contentWindow) {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    } catch (e) {
      console.warn('Iframe print failed, falling back:', e);
    }
  }
  if (activeReportBlobUrl) {
    const printWin = window.open(activeReportBlobUrl, '_blank');
    if (printWin) {
      printWin.focus();
      setTimeout(() => { try { printWin.print(); } catch (_) {} }, 500);
    }
  }
}

function downloadActiveReportPdf() {
  if (!activeReportBlobUrl) {
    if (typeof showToast === 'function') showToast('Please select at least one section to export', 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = activeReportBlobUrl;
  a.download = activeReportFileName || 'ResQTrack_Report.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof showToast === 'function') showToast('Report PDF downloaded successfully');
}

async function buildReportPdf(options = {}) {
  const {
    includeSummary = true,
    includeIncidents = true,
    includeResponders = true,
    includeSignatures = true,
  } = options;

  const user = typeof getUser === 'function' ? getUser() : null;
  const tenantSlug = typeof getTenantSlug === 'function' ? getTenantSlug() : (user?.version || 'manay');
  const isNewVisayas = tenantSlug === 'new-visayas';
  const tenantTitle = isNewVisayas ? 'BARANGAY NEW VISAYAS' : 'BARANGAY MANAY';

  if (cachedTenantLoaded !== tenantSlug || !cachedLogoData) {
    const baseTemplateUrl = isNewVisayas
      ? '/public/templates/new-visayas-report-base.jpg'
      : null;
    const logoUrl = isNewVisayas
      ? '/public/images/seal-new-visayas.png'
      : '/public/images/seal-manay.png';

    const [baseData, logoData] = await Promise.all([
      baseTemplateUrl ? loadImageAsBase64(baseTemplateUrl) : Promise.resolve(null),
      loadImageAsBase64(logoUrl),
    ]);
    cachedTemplateBaseData = baseData;
    cachedLogoData = logoData;
    cachedTenantLoaded = tenantSlug;
  }

  const baseData = cachedTemplateBaseData;
  const logoData = cachedLogoData;

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
  const ongoing  = filtered.filter(i => ['Assigned', 'Initiate', 'Delayed'].includes(i.status)).length;

  let perfList = _cachedPerformance;
  if (f.responder) {
    perfList = perfList.filter(r => r.id == f.responder);
  }

  const drawnPages = new Set();
  function ensurePageBackground(pageNum) {
    if (drawnPages.has(pageNum)) return;
    drawnPages.add(pageNum);
    if (isNewVisayas && baseData) {
      doc.setPage(pageNum);
      doc.addImage(baseData, 'JPEG', 0, 0, 210, 297);
    }
  }

  // ── Layout configuration based on Tenant ─────────────────
  let currentY = 70;
  const primaryThemeColor = isNewVisayas ? [24, 76, 120] : [30, 64, 175];
  const safeMargins = isNewVisayas && baseData
    ? { top: 48, bottom: 26, left: 14, right: 14 }
    : { top: 20, bottom: 20, left: 14, right: 14 };

  if (isNewVisayas && baseData) {
    // Page 1 gets the official full-page New Visayas stationery background
    ensurePageBackground(1);

    // Document Title below the official header
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 54, 93);
    doc.text('INCIDENT & PERFORMANCE REPORT', 105, 50, { align: 'center' });

    // Metadata ribbon
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, 53, 182, 10, 1.5, 1.5, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`PERIOD: ${periodLabel.toUpperCase()}`, 18, 59.5);
    doc.text(`INCIDENT TYPE: ${typeLabel.toUpperCase()}`, 82, 59.5);
    doc.text(`GENERATED: ${generated.toUpperCase()}`, 192, 59.5, { align: 'right' });

    currentY = 67;
  } else {
    // Barangay Manay / Official Header
    const logoSize = 24; // mm, circular seal
    const logoX    = 14;
    const logoY    = 10;
    const textX    = logoX + logoSize + 5; // 43mm

    if (logoData) {
      doc.addImage(logoData, 'PNG', logoX, logoY, logoSize, logoSize);
    }

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('REPUBLIC OF THE PHILIPPINES · CITY OF PANABO', textX, 14);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 54, 93);
    doc.text('BARANGAY MANAY', textX, 20);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text('Official Incident & Performance Report', textX, 25.5);

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ResQTrack Incident Management & Response System', textX, 30.5);

    // Divider line
    const divY = 36;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(14, divY, 196, divY);

    // Metadata ribbon
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, 39, 182, 8.5, 1.5, 1.5, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(`PERIOD: ${periodLabel.toUpperCase()}`, 18, 44.5);
    doc.text(`INCIDENT TYPE: ${typeLabel.toUpperCase()}`, 82, 44.5);
    doc.text(`GENERATED: ${generated.toUpperCase()}`, 192, 44.5, { align: 'right' });

    currentY = 52;
  }

  const anySectionSelected = includeSummary || includeIncidents || includeResponders || includeSignatures;
  if (!anySectionSelected) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text('No sections selected for this report.', 105, currentY + 20, { align: 'center' });
  }

  // ── 1. Summary Cards Table ──────────────────────────────────
  if (includeSummary) {
    doc.autoTable({
      startY: currentY,
      head: [['Total Incidents', 'Resolved', 'Pending', 'Assigned / Initiate / Delayed']],
      body: [[total, resolved, pending, ongoing]],
      theme: 'grid',
      headStyles: { fillColor: primaryThemeColor, textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 11, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { textColor: [30, 30, 30] },
        1: { textColor: [22, 163, 74] },
        2: { textColor: [202, 138, 4] },
        3: { textColor: [37, 99, 235] },
      },
      margin: safeMargins,
      willDrawPage: (data) => ensurePageBackground(data.pageNumber),
    });

    currentY = doc.lastAutoTable.finalY + 8;
  }

  // ── 2. Incident Records Table ───────────────────────────────
  if (includeIncidents) {
    const pageBreakY = isNewVisayas && baseData ? 240 : 250;
    if (currentY > pageBreakY) {
      doc.addPage();
      ensurePageBackground(doc.internal.getNumberOfPages());
      currentY = isNewVisayas && baseData ? 52 : 24;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Incident Records', 14, currentY);

    if (filtered.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('No incidents found for this period.', 14, currentY + 6);
      currentY += 12;
    } else {
      doc.autoTable({
        startY: currentY + 3,
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
        headStyles: { fillColor: primaryThemeColor, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { cellWidth: 32 }, 5: { cellWidth: 36 } },
        margin: safeMargins,
        willDrawPage: (data) => ensurePageBackground(data.pageNumber),
      });
      currentY = doc.lastAutoTable.finalY + 8;
    }
  }

  // ── 3. Responder Performance Table ──────────────────────────
  if (includeResponders) {
    const pageBreakY = isNewVisayas && baseData ? 240 : 250;
    if (currentY > pageBreakY) {
      doc.addPage();
      ensurePageBackground(doc.internal.getNumberOfPages());
      currentY = isNewVisayas && baseData ? 52 : 24;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Responder Performance', 14, currentY);

    if (perfList.length === 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text('No responder data available.', 14, currentY + 6);
      currentY += 12;
    } else {
      doc.autoTable({
        startY: currentY + 3,
        head: [['Responder', 'Assigned', 'Resolved', 'Avg Response Time', 'Avg Resolution Time']],
        body: perfList.map(r => [
          r.full_name,
          r.total_assigned || 0,
          r.resolved       || 0,
          fmtMinutes(r.avg_response_time_minutes),
          fmtMinutes(r.avg_resolution_minutes),
        ]),
        theme: 'striped',
        headStyles: { fillColor: primaryThemeColor, textColor: 255, fontSize: 8, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        margin: safeMargins,
        willDrawPage: (data) => ensurePageBackground(data.pageNumber),
      });
      currentY = doc.lastAutoTable.finalY + 8;
    }
  }

  // ── 4. Official Signatures / Certification ──────────────────
  if (includeSignatures) {
    let sigY = currentY + 6;
    const pageLimit = isNewVisayas && baseData ? 245 : 255;
    if (sigY > pageLimit) {
      doc.addPage();
      ensurePageBackground(doc.internal.getNumberOfPages());
      sigY = isNewVisayas && baseData ? 56 : 24;
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    doc.text('Prepared by:', 20, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(user?.full_name ? user.full_name.toUpperCase() : 'BARANGAY SYSTEM ADMINISTRATOR', 20, sigY + 12);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(20, sigY + 13, 85, sigY + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('ResQTrack Records & Analytics Section', 20, sigY + 17);

    doc.setFontSize(8);
    doc.text('Approved & Noted by:', 125, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('HON. PUNONG BARANGAY', 125, sigY + 12);
    doc.line(125, sigY + 13, 190, sigY + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`${tenantTitle}, Panabo City`, 125, sigY + 17);
  }

  // ── Footer on every page ─────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  const footerY = isNewVisayas && baseData ? 273 : 289;
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`ResQTrack Incident Management System · Official Report of ${tenantTitle}`, 14, footerY);
    doc.text(`Page ${p} of ${pageCount}`, 196, footerY, { align: 'right' });
  }

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '-');
  const fileName = isNewVisayas
    ? `Barangay_New_Visayas_Report_${safePeriod}.pdf`
    : `ResQTrack_Report_${safePeriod}.pdf`;

  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  return {
    doc,
    fileName,
    blob,
    blobUrl,
    pageCount,
    totalIncidents: total,
    totalResponders: perfList.length,
    periodLabel,
  };
}

function downloadPDF() {
  openReportExportModal();
}

function downloadExcelFromModal() {
  const sections = getExportSections();
  downloadExcel(sections);
}

function downloadExcel(sections = null) {
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

  let perfList = _cachedPerformance;
  if (f.responder) {
    perfList = perfList.filter(r => r.id == f.responder);
  }

  const performanceRows = perfList.map(r => ({
    'Responder':            r.full_name,
    'Assigned':             r.total_assigned || 0,
    'Resolved':             r.resolved || 0,
    'Avg Response (min)':   r.avg_response_time_minutes ?? '',
    'Avg Resolution (min)': r.avg_resolution_minutes ?? '',
  }));

  const wb = XLSX.utils.book_new();

  if (sections) {
    let sheetAdded = false;
    if (sections.includeSummary) {
      const summaryRows = [
        { 'Metric': 'Period', 'Value': getPeriodLabel(f) },
        { 'Metric': 'Incident Type', 'Value': f.type || 'All Types' },
        { 'Metric': 'Generated At', 'Value': new Date().toLocaleString('en-PH') },
        { 'Metric': 'Total Incidents', 'Value': filtered.length },
        { 'Metric': 'Resolved Incidents', 'Value': filtered.filter(i => i.status === 'Resolved' || i.status === 'Archived').length },
        { 'Metric': 'Pending Incidents', 'Value': filtered.filter(i => i.status === 'Pending').length },
        { 'Metric': 'Active / Ongoing Incidents', 'Value': filtered.filter(i => ['Assigned', 'Initiate', 'Delayed'].includes(i.status)).length },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
      sheetAdded = true;
    }
    if (sections.includeIncidents) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidentRows.length ? incidentRows : [{ 'Notice': 'No incidents found for this period' }]), 'Incidents');
      sheetAdded = true;
    }
    if (sections.includeResponders) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(performanceRows.length ? performanceRows : [{ 'Notice': 'No responder data available' }]), 'Responder Performance');
      sheetAdded = true;
    }
    if (!sheetAdded) {
      if (typeof showToast === 'function') showToast('Please select at least one section to export', 'error');
      return;
    }
  } else {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidentRows), 'Incidents');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(performanceRows), 'Responder Performance');
  }

  const safePeriod = getPeriodLabel(f).replace(/[^a-zA-Z0-9]/g, '-');
  XLSX.writeFile(wb, `ResQTrack-Report-${safePeriod}.xlsx`);
  if (typeof showToast === 'function') showToast('Excel report downloaded');
}
