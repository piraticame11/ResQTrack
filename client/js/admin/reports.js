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

async function populatePurokSelector(elOrId, placeholder = '— Select Purok —') {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  if (typeof populatePurokSelect === 'function') {
    return populatePurokSelect(el, { placeholder });
  }
}

async function initReportsPage() {
  try {
    const user = typeof requireRole === 'function' ? requireRole('admin') : null;
    if (!user) return;
    if (typeof setUserUI === 'function') setUserUI(user);

    const yearSel = document.getElementById('report-year');
    const now     = new Date();

    if (yearSel && yearSel.options.length === 0) {
      for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
        const o = document.createElement('option');
        o.value = y; o.textContent = y;
        yearSel.appendChild(o);
      }
    }

    const monthSel = document.getElementById('report-month');
    if (monthSel) monthSel.value = now.getMonth() + 1;

    const periodSel = document.getElementById('report-period');
    if (periodSel) periodSel.value = 'annual';

    populateWeekSelector();

    const purokEl = document.getElementById('filter-purok');
    if (purokEl && typeof populatePurokSelect === 'function') {
      try {
        await populatePurokSelect(purokEl, { placeholder: 'All Puroks' });
      } catch (purokErr) {
        console.warn('Failed to populate purok selector:', purokErr);
      }
    }

    try {
      await populateResponderSelector();
    } catch (respErr) {
      console.warn('Failed to populate responder selector:', respErr);
    }

    onPeriodChange(false);
    await loadReports();
  } catch (err) {
    console.error('Reports initialization error:', err);
    try {
      await loadReports();
    } catch (loadErr) {
      console.error('Fallback loadReports error:', loadErr);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportsPage);
} else {
  initReportsPage();
}

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
let currentExportFormat = 'pdf'; // 'pdf' | 'excel'

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
  updateActiveReportPreview();
}

function openExcelExportModal() {
  openReportExportModal('excel');
}

function openReportExportModal(format = 'pdf') {
  currentExportFormat = format;
  const modal = document.getElementById('report-export-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  applyModalFormatStyles();
  updateActiveReportPreview();
}

function closeReportExportModal() {
  const modal = document.getElementById('report-export-modal');
  if (modal) modal.classList.add('hidden');
}

function switchReportExportFormat(format) {
  if (currentExportFormat === format) return;
  currentExportFormat = format;
  applyModalFormatStyles();
  updateActiveReportPreview();
}

function applyModalFormatStyles() {
  const isExcel = currentExportFormat === 'excel';
  const iconBadge = document.getElementById('export-modal-icon-badge');
  const icon = document.getElementById('export-modal-icon');
  const title = document.getElementById('export-modal-title');
  const subtitle = document.getElementById('export-modal-subtitle');
  const tabPdf = document.getElementById('tab-format-pdf');
  const tabExcel = document.getElementById('tab-format-excel');
  const actionsPdf = document.getElementById('export-actions-pdf');
  const actionsExcel = document.getElementById('export-actions-excel');
  const footerPdf = document.getElementById('export-footer-pdf-actions');
  const footerExcel = document.getElementById('export-footer-excel-actions');

  if (isExcel) {
    if (iconBadge) {
      iconBadge.className = 'w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base shrink-0 border border-emerald-200';
    }
    if (icon) icon.className = 'fa-solid fa-file-excel';
    if (title) title.textContent = 'Report Excel Export & Preview';
    if (subtitle) subtitle.textContent = 'Select sections to include and live-preview spreadsheet (1 single tab) before exporting';

    if (tabExcel) {
      tabExcel.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all text-emerald-700 bg-white shadow-2xs border border-emerald-300';
    }
    if (tabPdf) {
      tabPdf.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all text-gray-600 hover:text-red-700 hover:bg-white/80';
    }
    if (actionsPdf) actionsPdf.classList.add('hidden');
    if (actionsExcel) actionsExcel.classList.remove('hidden');
    if (footerPdf) footerPdf.classList.add('hidden');
    if (footerExcel) footerExcel.classList.remove('hidden');
  } else {
    if (iconBadge) {
      iconBadge.className = 'w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-base shrink-0 border border-red-100';
    }
    if (icon) icon.className = 'fa-solid fa-file-pdf';
    if (title) title.textContent = 'Report PDF Export & Preview';
    if (subtitle) subtitle.textContent = 'Select sections to include and live-preview before exporting';

    if (tabPdf) {
      tabPdf.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all text-red-700 bg-white shadow-2xs border border-red-200';
    }
    if (tabExcel) {
      tabExcel.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all text-gray-600 hover:text-emerald-700 hover:bg-white/80';
    }
    if (actionsPdf) actionsPdf.classList.remove('hidden');
    if (actionsExcel) actionsExcel.classList.add('hidden');
    if (footerPdf) footerPdf.classList.remove('hidden');
    if (footerExcel) footerExcel.classList.add('hidden');
  }
}

async function updateActiveReportPreview() {
  if (currentExportFormat === 'excel') {
    updateExcelReportPreview();
  } else {
    await updateReportPreview();
  }
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
  openReportExportModal('pdf');
}

function downloadExcelFromModal() {
  const sections = getExportSections();
  downloadExcel(sections);
}

function downloadExcel(sections = null) {
  const f = getFilters();
  const filtered = filterIncidents(_cachedIncidents, f);

  const user = typeof getUser === 'function' ? getUser() : null;
  const tenantSlug = typeof getTenantSlug === 'function' ? getTenantSlug() : (user?.version || 'manay');
  const isNewVisayas = tenantSlug === 'new-visayas';
  const tenantTitle = isNewVisayas ? 'BARANGAY NEW VISAYAS' : 'BARANGAY MANAY';
  const periodLabel = getPeriodLabel(f);
  const typeLabel   = f.type || 'All Types';
  const generated   = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  const generatedBy = user?.full_name ? user.full_name.toUpperCase() : 'BARANGAY SYSTEM ADMINISTRATOR';

  const total    = filtered.length;
  const resolved = filtered.filter(i => i.status === 'Resolved' || i.status === 'Archived').length;
  const pending  = filtered.filter(i => i.status === 'Pending').length;
  const ongoing  = filtered.filter(i => ['Assigned', 'Initiate', 'Delayed'].includes(i.status)).length;
  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) + '%' : '0.0%';

  let perfList = _cachedPerformance;
  if (f.responder) {
    perfList = perfList.filter(r => r.id == f.responder);
  }

  // Default to exporting all sections if sections is not passed
  const sec = sections || {
    includeSummary: true,
    includeIncidents: true,
    includeResponders: true,
    includeSignatures: true,
  };

  const anyChecked = sec.includeSummary || sec.includeIncidents || sec.includeResponders || sec.includeSignatures;
  if (!anyChecked) {
    if (typeof showToast === 'function') showToast('Please select at least one section to export', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const reportAoa = [];

  // ── 1. Official Letterhead ─────────────────────────────────
  reportAoa.push(['REPUBLIC OF THE PHILIPPINES · CITY OF PANABO']);
  reportAoa.push([tenantTitle]);
  reportAoa.push(['OFFICIAL INCIDENT & PERFORMANCE REPORT']);
  reportAoa.push(['ResQTrack Incident Management & Response System']);
  reportAoa.push([]);

  // ── 2. Report Metadata ─────────────────────────────────────
  reportAoa.push(['REPORT METADATA', '']);
  reportAoa.push(['Reporting Period:', periodLabel.toUpperCase()]);
  reportAoa.push(['Incident Type Filter:', typeLabel.toUpperCase()]);
  reportAoa.push(['Date & Time Generated:', generated]);
  reportAoa.push(['Generated By:', `${generatedBy} (System Administrator)`]);
  reportAoa.push(['Barangay Jurisdiction:', `${tenantTitle}, City of Panabo, Davao del Norte`]);
  reportAoa.push([]);

  // ── 3. Executive Summary & Status Breakdown ───────────────
  if (sec.includeSummary) {
    reportAoa.push(['EXECUTIVE SUMMARY', '', '', '']);
    reportAoa.push(['Metric', 'Count', 'Percentage of Total', 'Status Description']);
    reportAoa.push(['Total Incidents', total, '100.0%', 'All reported incidents within selected period']);
    reportAoa.push(['Resolved / Archived', resolved, resolutionRate, 'Successfully addressed and closed']);
    reportAoa.push(['Pending Verification', pending, total > 0 ? ((pending / total) * 100).toFixed(1) + '%' : '0.0%', 'Awaiting initial review or dispatch']);
    reportAoa.push(['Active / In Progress', ongoing, total > 0 ? ((ongoing / total) * 100).toFixed(1) + '%' : '0.0%', 'Currently assigned, initiated, or delayed']);
    reportAoa.push(['Critical / High Priority', filtered.filter(i => (i.triage_color || '').toLowerCase() === 'red').length, total > 0 ? ((filtered.filter(i => (i.triage_color || '').toLowerCase() === 'red').length / total) * 100).toFixed(1) + '%' : '0.0%', 'Red triage emergency level incidents']);
    reportAoa.push([]);

    reportAoa.push(['STATUS BREAKDOWN', '', '']);
    reportAoa.push(['Status', 'Count', 'Share']);
    const statusBreakdown = [
      ['Pending',  filtered.filter(i => i.status === 'Pending').length],
      ['Assigned', filtered.filter(i => i.status === 'Assigned').length],
      ['Initiate', filtered.filter(i => i.status === 'Initiate').length],
      ['Delayed',  filtered.filter(i => i.status === 'Delayed').length],
      ['Resolved', filtered.filter(i => i.status === 'Resolved').length],
      ['Archived', filtered.filter(i => i.status === 'Archived').length],
    ];
    statusBreakdown.forEach(([st, cnt]) => {
      reportAoa.push([st, cnt, total > 0 ? ((cnt / total) * 100).toFixed(1) + '%' : '0.0%']);
    });
    reportAoa.push([]);
  }

  // ── 4. Incident Records ────────────────────────────────────
  if (sec.includeIncidents) {
    reportAoa.push(['INCIDENT RECORDS', '']);
    reportAoa.push([`Period: ${periodLabel} | Filter: ${typeLabel} | Total Records: ${total}`]);
    reportAoa.push([
      'Ref No.',
      'Incident Type',
      'Status',
      'Triage Level',
      'Purok',
      'Location Details',
      'Reporter Name',
      'Reporter Contact',
      'Assigned Responder',
      'Date & Time Reported',
      'Date & Time Resolved',
      'Description',
    ]);

    if (filtered.length === 0) {
      reportAoa.push(['No incidents found for this period.']);
    } else {
      filtered.forEach(i => {
        reportAoa.push([
          i.reference_no || '—',
          i.incident_type || '—',
          i.status || '—',
          i.triage_color || '—',
          i.purok_name || '—',
          i.address_details || '—',
          i.reporter_name || '—',
          i.reporter_phone || '—',
          i.responder_name || '—',
          i.reported_at ? new Date(i.reported_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
          i.resolved_at ? new Date(i.resolved_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
          i.description || '—',
        ]);
      });
    }
    reportAoa.push([]);
  }

  // ── 5. Responder Performance ───────────────────────────────
  if (sec.includeResponders) {
    reportAoa.push(['RESPONDER PERFORMANCE REPORT', '']);
    reportAoa.push([`Period: ${periodLabel} | Total Responders: ${perfList.length}`]);
    reportAoa.push([
      'Responder Name',
      'Total Assigned',
      'Incidents Resolved',
      'Active / Ongoing',
      'Resolution Rate',
      'Avg Response Time',
      'Avg Resolution Time',
    ]);

    if (perfList.length === 0) {
      reportAoa.push(['No responder data available for this period.']);
    } else {
      perfList.forEach(r => {
        const assigned = Number(r.total_assigned) || 0;
        const resCount = Number(r.resolved) || 0;
        const ongoingCount = Math.max(0, assigned - resCount);
        const rate = assigned > 0 ? ((resCount / assigned) * 100).toFixed(1) + '%' : '0.0%';
        reportAoa.push([
          r.full_name || '—',
          assigned,
          resCount,
          ongoingCount,
          rate,
          fmtMinutes(r.avg_response_time_minutes),
          fmtMinutes(r.avg_resolution_minutes),
        ]);
      });
    }
    reportAoa.push([]);
  }

  // ── 6. Signatures & Certification ──────────────────────────
  if (sec.includeSignatures) {
    reportAoa.push(['OFFICIAL CERTIFICATION & SIGNATURES', '']);
    reportAoa.push(['This document certifies that the incident logs and performance statistics above have been officially recorded and verified in accordance with Barangay Incident Response protocols.']);
    reportAoa.push([]);
    reportAoa.push(['Prepared by:', '', '', 'Approved & Noted by:']);
    reportAoa.push([]);
    reportAoa.push([generatedBy, '', '', 'HON. PUNONG BARANGAY']);
    reportAoa.push(['Barangay System Administrator', '', '', 'Punong Barangay / Incident Commander']);
    reportAoa.push(['ResQTrack Records & Analytics Section', '', '', `${tenantTitle}, Panabo City`]);
    reportAoa.push(['Date Signed: ____________________', '', '', 'Date Signed: ____________________']);
    reportAoa.push([]);
    reportAoa.push([`Official Report of ${tenantTitle} · ResQTrack Incident Management System`]);
  }

  // Generate SINGLE worksheet (1 Tab only)
  const ws = XLSX.utils.aoa_to_sheet(reportAoa);
  ws['!cols'] = [
    { wch: 20 }, // Ref No. / Metric / Label / Responder
    { wch: 20 }, // Type / Count / Assigned
    { wch: 14 }, // Status / Share / Resolved
    { wch: 14 }, // Triage / Active / Approved
    { wch: 16 }, // Purok / Resolution Rate
    { wch: 32 }, // Location Details / Avg Response
    { wch: 24 }, // Reporter Name / Avg Resolution
    { wch: 18 }, // Reporter Contact
    { wch: 24 }, // Assigned Responder
    { wch: 22 }, // Date Reported
    { wch: 22 }, // Date Resolved
    { wch: 45 }, // Description
  ];

  const sheetName = isNewVisayas ? 'New Visayas Report' : 'Barangay Report';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9]/g, '-');
  const fileName = isNewVisayas
    ? `Barangay_New_Visayas_Report_${safePeriod}.xlsx`
    : `ResQTrack_Report_${safePeriod}.xlsx`;

  XLSX.writeFile(wb, fileName);
  if (typeof showToast === 'function') showToast('Excel report downloaded (1 sheet)');
}

function updateExcelReportPreview() {
  const canvas = document.getElementById('report-preview-canvas');
  const statsEl = document.getElementById('report-preview-stats');
  const btnExcelDownloads = document.querySelectorAll('.btn-excel-download-target');

  const sections = getExportSections();
  const anyChecked = sections.includeSummary || sections.includeIncidents || sections.includeResponders || sections.includeSignatures;

  if (!anyChecked) {
    if (canvas) {
      canvas.innerHTML = `
        <div class="p-8 text-center text-gray-500 my-auto">
          <i class="fa-solid fa-square-check text-4xl text-gray-400 mb-3 block"></i>
          <p class="font-semibold text-gray-800 text-base">No sections selected</p>
          <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Please select at least one section above to generate and export your Excel report.</p>
        </div>
      `;
    }
    if (statsEl) {
      statsEl.innerHTML = `<span class="text-amber-600 flex items-center gap-1.5 font-medium"><i class="fa-solid fa-triangle-exclamation"></i>Select at least one section</span>`;
    }
    btnExcelDownloads.forEach(btn => { btn.disabled = true; });
    return;
  }

  btnExcelDownloads.forEach(btn => { btn.disabled = false; });

  const f = getFilters();
  const filtered = filterIncidents(_cachedIncidents, f);
  let perfList = _cachedPerformance;
  if (f.responder) {
    perfList = perfList.filter(r => r.id == f.responder);
  }

  const user = typeof getUser === 'function' ? getUser() : null;
  const tenantSlug = typeof getTenantSlug === 'function' ? getTenantSlug() : (user?.version || 'manay');
  const isNewVisayas = tenantSlug === 'new-visayas';
  const tenantTitle = isNewVisayas ? 'BARANGAY NEW VISAYAS' : 'BARANGAY MANAY';
  const sheetName = isNewVisayas ? 'New Visayas Report' : 'Barangay Report';

  const previewHtml = buildExcelReportPreviewHtml({
    sections,
    filtered,
    perfList,
    filters: f,
    tenantTitle,
    sheetName,
    user,
  });

  if (canvas) {
    canvas.innerHTML = previewHtml;
  }

  if (statsEl) {
    statsEl.innerHTML = `
      <i class="fa-solid fa-circle-check text-emerald-600"></i>
      <span class="text-gray-700 font-medium">${filtered.length} incident(s) · ${perfList.length} responder(s) · 1 Worksheet (Single Tab) ready</span>
    `;
  }
}

function buildExcelReportPreviewHtml(opts) {
  const { sections, filtered, perfList, filters, tenantTitle, sheetName, user } = opts;
  const periodLabel = getPeriodLabel(filters);
  const typeLabel   = filters.type || 'All Types';
  const generated   = new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });
  const generatedBy = user?.full_name ? user.full_name.toUpperCase() : 'BARANGAY SYSTEM ADMINISTRATOR';

  const total    = filtered.length;
  const resolved = filtered.filter(i => i.status === 'Resolved' || i.status === 'Archived').length;
  const pending  = filtered.filter(i => i.status === 'Pending').length;
  const ongoing  = filtered.filter(i => ['Assigned', 'Initiate', 'Delayed'].includes(i.status)).length;
  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) + '%' : '0.0%';

  let rowCounter = 1;
  const rows = [];

  function addRow(cells, customRowClass = '') {
    const rowNum = rowCounter++;
    const cellsHtml = cells.map(c => {
      let text = c !== undefined && c !== null ? String(c) : '';
      let colSpan = 1;
      let cellClass = 'border border-gray-200 px-3 py-1.5 text-xs text-gray-800 bg-white align-top whitespace-nowrap';
      let style = '';

      if (typeof c === 'object' && c !== null) {
        text = c.text ?? '';
        colSpan = c.colSpan || 1;
        if (c.class) cellClass += ' ' + c.class;
        if (c.style) style = c.style;
      }
      return `<td class="${cellClass}" colspan="${colSpan}" style="${style}">${escapeHtml(text)}</td>`;
    }).join('');

    rows.push(`
      <tr class="${customRowClass}">
        <td class="w-10 min-w-[2.5rem] bg-gray-50 border border-gray-300 text-center font-mono text-[10px] text-gray-400 select-none py-1">${rowNum}</td>
        ${cellsHtml}
      </tr>
    `);
  }

  function addBlankRow() {
    addRow([{ text: '', colSpan: 12, class: 'bg-white h-3.5 border-x border-gray-100 border-y-0' }]);
  }

  // ── 1. Official Letterhead ─────────────────────────────────
  addRow([{ text: 'REPUBLIC OF THE PHILIPPINES · CITY OF PANABO', colSpan: 12, class: 'font-bold text-gray-700 tracking-wider text-xs bg-slate-50' }]);
  addRow([{ text: tenantTitle, colSpan: 12, class: 'font-extrabold text-gray-900 text-sm tracking-wide bg-slate-50' }]);
  addRow([{ text: 'OFFICIAL INCIDENT & PERFORMANCE REPORT', colSpan: 12, class: 'font-bold text-blue-900 text-xs bg-slate-50' }]);
  addRow([{ text: 'ResQTrack Incident Management & Response System', colSpan: 12, class: 'italic text-gray-500 text-[11px] bg-slate-50' }]);
  addBlankRow();

  // ── 2. Report Metadata ─────────────────────────────────────
  addRow([{ text: 'REPORT METADATA', colSpan: 12, class: 'font-bold text-gray-800 bg-gray-100 border-b border-gray-300' }]);
  addRow([
    { text: 'Reporting Period:', class: 'font-semibold text-gray-600 bg-gray-50 w-48' },
    { text: periodLabel.toUpperCase(), colSpan: 11, class: 'font-bold text-gray-800' }
  ]);
  addRow([
    { text: 'Incident Type Filter:', class: 'font-semibold text-gray-600 bg-gray-50' },
    { text: typeLabel.toUpperCase(), colSpan: 11, class: 'font-bold text-gray-800' }
  ]);
  addRow([
    { text: 'Date & Time Generated:', class: 'font-semibold text-gray-600 bg-gray-50' },
    { text: generated, colSpan: 11, class: 'text-gray-800' }
  ]);
  addRow([
    { text: 'Generated By:', class: 'font-semibold text-gray-600 bg-gray-50' },
    { text: `${generatedBy} (System Administrator)`, colSpan: 11, class: 'text-gray-800' }
  ]);
  addRow([
    { text: 'Barangay Jurisdiction:', class: 'font-semibold text-gray-600 bg-gray-50' },
    { text: `${tenantTitle}, City of Panabo, Davao del Norte`, colSpan: 11, class: 'text-gray-800' }
  ]);
  addBlankRow();

  // ── 3. Executive Summary ───────────────────────────────────
  if (sections.includeSummary) {
    addRow([{ text: 'EXECUTIVE SUMMARY', colSpan: 12, class: 'font-bold text-emerald-900 bg-emerald-50/80 border border-emerald-200' }]);
    addRow([
      { text: 'Metric', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Count', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Percentage of Total', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Status Description', colSpan: 9, class: 'font-semibold text-gray-700 bg-gray-100' }
    ]);
    addRow([
      'Total Incidents',
      { text: total, class: 'text-center font-bold' },
      { text: '100.0%', class: 'text-center' },
      { text: 'All reported incidents within selected period', colSpan: 9 }
    ]);
    addRow([
      'Resolved / Archived',
      { text: resolved, class: 'text-center font-bold text-emerald-700' },
      { text: resolutionRate, class: 'text-center font-semibold text-emerald-700' },
      { text: 'Successfully addressed and closed', colSpan: 9 }
    ]);
    addRow([
      'Pending Verification',
      { text: pending, class: 'text-center font-bold text-amber-700' },
      { text: total > 0 ? ((pending / total) * 100).toFixed(1) + '%' : '0.0%', class: 'text-center' },
      { text: 'Awaiting initial review or dispatch', colSpan: 9 }
    ]);
    addRow([
      'Active / In Progress',
      { text: ongoing, class: 'text-center font-bold text-blue-700' },
      { text: total > 0 ? ((ongoing / total) * 100).toFixed(1) + '%' : '0.0%', class: 'text-center' },
      { text: 'Currently assigned, initiated, or delayed', colSpan: 9 }
    ]);
    const redCount = filtered.filter(i => (i.triage_color || '').toLowerCase() === 'red').length;
    addRow([
      'Critical / High Priority',
      { text: redCount, class: 'text-center font-bold text-red-600' },
      { text: total > 0 ? ((redCount / total) * 100).toFixed(1) + '%' : '0.0%', class: 'text-center' },
      { text: 'Red triage emergency level incidents', colSpan: 9 }
    ]);
    addBlankRow();

    addRow([{ text: 'STATUS BREAKDOWN', colSpan: 12, class: 'font-bold text-gray-800 bg-gray-100' }]);
    addRow([
      { text: 'Status', class: 'font-semibold text-gray-700 bg-gray-50' },
      { text: 'Count', class: 'font-semibold text-gray-700 bg-gray-50 text-center' },
      { text: 'Share', class: 'font-semibold text-gray-700 bg-gray-50 text-center' },
      { text: '', colSpan: 9, class: 'bg-white' }
    ]);
    const statusBreakdown = [
      ['Pending',  filtered.filter(i => i.status === 'Pending').length],
      ['Assigned', filtered.filter(i => i.status === 'Assigned').length],
      ['Initiate', filtered.filter(i => i.status === 'Initiate').length],
      ['Delayed',  filtered.filter(i => i.status === 'Delayed').length],
      ['Resolved', filtered.filter(i => i.status === 'Resolved').length],
      ['Archived', filtered.filter(i => i.status === 'Archived').length],
    ];
    statusBreakdown.forEach(([st, cnt]) => {
      addRow([
        st,
        { text: cnt, class: 'text-center font-semibold' },
        { text: total > 0 ? ((cnt / total) * 100).toFixed(1) + '%' : '0.0%', class: 'text-center text-gray-600' },
        { text: '', colSpan: 9 }
      ]);
    });
    addBlankRow();
  }

  // ── 4. Incident Records ────────────────────────────────────
  if (sections.includeIncidents) {
    addRow([{ text: 'INCIDENT RECORDS', colSpan: 12, class: 'font-bold text-blue-900 bg-blue-50/80 border border-blue-200' }]);
    addRow([{ text: `Period: ${periodLabel} | Filter: ${typeLabel} | Total Records: ${total}`, colSpan: 12, class: 'text-gray-500 italic text-[11px] bg-slate-50' }]);
    addRow([
      { text: 'Ref No.', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Incident Type', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Status', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Triage Level', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Purok', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Location Details', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Reporter Name', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Reporter Contact', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Assigned Responder', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Date & Time Reported', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Date & Time Resolved', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Description', class: 'font-semibold text-gray-700 bg-gray-100' },
    ]);

    if (filtered.length === 0) {
      addRow([{ text: 'No incidents found for this period.', colSpan: 12, class: 'text-center py-4 text-gray-400 italic' }]);
    } else {
      filtered.forEach(i => {
        addRow([
          { text: i.reference_no || '—', class: 'font-mono text-gray-700' },
          { text: i.incident_type || '—', class: 'font-medium text-gray-900' },
          { text: i.status || '—', class: 'text-center font-medium' },
          { text: i.triage_color || '—', class: 'text-center font-medium' },
          i.purok_name || '—',
          i.address_details || '—',
          i.reporter_name || '—',
          i.reporter_phone || '—',
          i.responder_name || '—',
          i.reported_at ? new Date(i.reported_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
          i.resolved_at ? new Date(i.resolved_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
          { text: i.description || '—', class: 'max-w-xs truncate' },
        ]);
      });
    }
    addBlankRow();
  }

  // ── 5. Responder Performance ───────────────────────────────
  if (sections.includeResponders) {
    addRow([{ text: 'RESPONDER PERFORMANCE REPORT', colSpan: 12, class: 'font-bold text-emerald-900 bg-emerald-50/80 border border-emerald-200' }]);
    addRow([{ text: `Period: ${periodLabel} | Total Responders: ${perfList.length}`, colSpan: 12, class: 'text-gray-500 italic text-[11px] bg-slate-50' }]);
    addRow([
      { text: 'Responder Name', class: 'font-semibold text-gray-700 bg-gray-100' },
      { text: 'Total Assigned', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Incidents Resolved', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Active / Ongoing', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Resolution Rate', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Avg Response Time', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: 'Avg Resolution Time', class: 'font-semibold text-gray-700 bg-gray-100 text-center' },
      { text: '', colSpan: 5, class: 'bg-white' }
    ]);

    if (perfList.length === 0) {
      addRow([{ text: 'No responder data available for this period.', colSpan: 12, class: 'text-center py-4 text-gray-400 italic' }]);
    } else {
      perfList.forEach(r => {
        const assigned = Number(r.total_assigned) || 0;
        const resCount = Number(r.resolved) || 0;
        const ongoingCount = Math.max(0, assigned - resCount);
        const rate = assigned > 0 ? ((resCount / assigned) * 100).toFixed(1) + '%' : '0.0%';
        addRow([
          { text: r.full_name || '—', class: 'font-medium text-gray-900' },
          { text: assigned, class: 'text-center font-bold' },
          { text: resCount, class: 'text-center font-semibold text-emerald-700' },
          { text: ongoingCount, class: 'text-center font-semibold text-blue-700' },
          { text: rate, class: 'text-center font-bold' },
          { text: fmtMinutes(r.avg_response_time_minutes), class: 'text-center font-mono text-gray-700' },
          { text: fmtMinutes(r.avg_resolution_minutes), class: 'text-center font-mono text-gray-700' },
          { text: '', colSpan: 5 }
        ]);
      });
    }
    addBlankRow();
  }

  // ── 6. Signatures & Certification ──────────────────────────
  if (sections.includeSignatures) {
    addRow([{ text: 'OFFICIAL CERTIFICATION & SIGNATURES', colSpan: 12, class: 'font-bold text-gray-800 bg-gray-100 border-b border-gray-300' }]);
    addRow([{ text: 'This document certifies that the incident logs and performance statistics above have been officially recorded and verified in accordance with Barangay Incident Response protocols.', colSpan: 12, class: 'text-gray-600 italic text-[11px]' }]);
    addBlankRow();
    addRow([
      { text: 'Prepared by:', colSpan: 6, class: 'font-semibold text-gray-700' },
      { text: 'Approved & Noted by:', colSpan: 6, class: 'font-semibold text-gray-700' }
    ]);
    addBlankRow();
    addRow([
      { text: generatedBy, colSpan: 6, class: 'font-bold text-gray-900 border-b border-gray-400' },
      { text: 'HON. PUNONG BARANGAY', colSpan: 6, class: 'font-bold text-gray-900 border-b border-gray-400' }
    ]);
    addRow([
      { text: 'Barangay System Administrator', colSpan: 6, class: 'text-gray-600 text-[11px]' },
      { text: 'Punong Barangay / Incident Commander', colSpan: 6, class: 'text-gray-600 text-[11px]' }
    ]);
    addRow([
      { text: 'ResQTrack Records & Analytics Section', colSpan: 6, class: 'text-gray-500 text-[11px]' },
      { text: `${tenantTitle}, City of Panabo`, colSpan: 6, class: 'text-gray-500 text-[11px]' }
    ]);
    addRow([
      { text: 'Date Signed: ____________________', colSpan: 6, class: 'text-gray-600 text-[11px]' },
      { text: 'Date Signed: ____________________', colSpan: 6, class: 'text-gray-600 text-[11px]' }
    ]);
    addBlankRow();
    addRow([{ text: `Official Report of ${tenantTitle} · ResQTrack Incident Management System`, colSpan: 12, class: 'text-center text-[10px] text-gray-400 italic' }]);
  }

  const totalSheetRows = rowCounter - 1;

  return `
    <div class="w-full flex flex-col flex-1 min-h-[58vh] max-w-full">
      <!-- Top info bar inside sheet preview (White Theme) -->
      <div class="bg-white border border-gray-200 rounded-t-xl px-4 py-2.5 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-xs font-bold shadow-2xs">
            <i class="fa-solid fa-file-excel"></i>
          </div>
          <div>
            <span class="font-bold text-gray-800 text-xs">${escapeHtml(sheetName)}</span>
            <span class="text-gray-500 text-[11px] ml-1.5">(1 Single Tab · All Sections Included)</span>
          </div>
        </div>
        <div class="flex items-center gap-2 text-[11px] text-gray-500">
          <span class="px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200 font-mono">A1:L${totalSheetRows}</span>
          <span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">${totalSheetRows} Rows</span>
        </div>
      </div>

      <!-- Scrollable Spreadsheet Grid (White Theme) -->
      <div class="overflow-x-auto overflow-y-auto max-h-[62vh] bg-white border-x border-gray-200 shadow-inner">
        <table class="w-full border-collapse font-sans text-xs min-w-[960px]">
          <thead>
            <tr class="bg-gray-100 text-gray-600 font-mono text-[11px] sticky top-0 z-10 shadow-2xs">
              <th class="w-10 min-w-[2.5rem] border border-gray-300 py-1 text-center font-normal text-gray-400 bg-gray-100">#</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">A</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">B</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[8%]">C</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[8%]">D</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[10%]">E</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[16%]">F</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">G</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[10%]">H</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">I</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">J</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[12%]">K</th>
              <th class="border border-gray-300 px-2 py-1 text-center font-semibold bg-gray-100 w-[20%]">L</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Sheet Tab Bar (White Theme) -->
      <div class="bg-gray-100 border border-gray-300 border-t-0 rounded-b-xl px-4 py-1.5 flex items-center justify-between text-xs select-none shrink-0">
        <div class="flex items-center gap-1">
          <div class="bg-white border-x border-t border-gray-300 border-b-2 border-b-emerald-600 px-3 py-1 rounded-t font-semibold text-gray-800 shadow-2xs flex items-center gap-1.5">
            <i class="fa-solid fa-file-excel text-emerald-600 text-xs"></i>
            <span>${escapeHtml(sheetName)}</span>
          </div>
        </div>
        <div class="text-[11px] text-gray-500 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-check text-emerald-600"></i>
          <span>Single worksheet (1 tab only) — all selected sections stacked in one sheet</span>
        </div>
      </div>
    </div>
  `;
}
