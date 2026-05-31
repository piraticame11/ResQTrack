let annualChart, typeChart, purokChart;

(async function () {
  const user = requireRole('admin');
  if (!user) return;
  setUserUI(user);

  const yearSel  = document.getElementById('report-year');
  const monthSel = document.getElementById('report-month');
  const now      = new Date();

  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    const o = document.createElement('option'); o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }
  monthSel.value = now.getMonth() + 1;

  populateWeekSelector();

  document.getElementById('report-year').addEventListener('change', loadReports);
  document.getElementById('report-month').addEventListener('change', loadReports);
  document.getElementById('perf-week').addEventListener('change', loadPerformance);

  await loadReports();
})();

function populateWeekSelector() {
  const sel = document.getElementById('perf-week');
  const now = new Date();
  // Snap to Monday of current week
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

function onPerfPeriodChange() {
  const period  = document.getElementById('perf-period').value;
  const weekSel = document.getElementById('perf-week');
  weekSel.classList.toggle('hidden', period !== 'weekly');
  loadPerformance();
}

async function loadReports() {
  const year  = document.getElementById('report-year').value;
  const month = document.getElementById('report-month').value;

  const [annualRes, typeRes, purokRes, allRes] = await Promise.all([
    api.get(`/reports/annual?year=${year}`),
    api.get(`/reports/by-type?year=${year}&month=${month}`),
    api.get(`/reports/by-purok?year=${year}&month=${month}`),
    api.get('/incidents'),
  ]);

  const annualData = annualRes && annualRes.ok ? await annualRes.json() : [];
  const typeData   = typeRes   && typeRes.ok   ? await typeRes.json()   : [];
  const purokData  = purokRes  && purokRes.ok  ? await purokRes.json()  : [];
  const all        = allRes    && allRes.ok     ? await allRes.json()    : [];

  const yearInc = all.filter(i => new Date(i.reported_at).getFullYear() == year);
  document.getElementById('rpt-total').textContent    = yearInc.length;
  document.getElementById('rpt-resolved').textContent = yearInc.filter(i => i.status === 'Resolved' || i.status === 'Archived').length;
  document.getElementById('rpt-pending').textContent  = all.filter(i => i.status === 'Pending').length;
  document.getElementById('rpt-month').textContent    = all.filter(i => {
    const d = new Date(i.reported_at);
    return d.getFullYear() == year && d.getMonth() + 1 == month;
  }).length;

  renderAnnualChart(annualData);
  renderTypeChart(typeData);
  renderPurokChart(purokData);
  await loadPerformance();
}

async function loadPerformance() {
  const year   = document.getElementById('report-year').value;
  const month  = document.getElementById('report-month').value;
  const period = document.getElementById('perf-period').value;
  const week   = document.getElementById('perf-week').value;

  let url = '/reports/responder-performance';
  if (period === 'monthly') {
    url += `?period=monthly&year=${year}&month=${month}`;
  } else if (period === 'weekly' && week) {
    url += `?period=weekly&week=${week}`;
  }

  const perfRes = await api.get(url);
  const perfData = perfRes && perfRes.ok ? await perfRes.json() : [];
  renderPerformanceTable(perfData, period, year, month, week);
}

function renderAnnualChart(data) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const counts = new Array(12).fill(0);
  data.forEach(r => { counts[r.month - 1] = r.count; });
  if (annualChart) annualChart.destroy();
  annualChart = new Chart(document.getElementById('annual-chart'), {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Incidents', data: counts, backgroundColor: '#3b82f6', borderRadius: 6 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
  });
}

function renderTypeChart(data) {
  const colors = ['#ef4444','#3b82f6','#f97316','#eab308','#22c55e','#6b7280'];
  if (typeChart) typeChart.destroy();
  typeChart = new Chart(document.getElementById('type-chart'), {
    type: 'pie',
    data: {
      labels: data.map(d => d.incident_type),
      datasets: [{ data: data.map(d => d.count), backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } } } },
  });
}

function renderPurokChart(data) {
  if (purokChart) purokChart.destroy();
  purokChart = new Chart(document.getElementById('purok-chart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.purok),
      datasets: [{ label: 'Incidents', data: data.map(d => d.count), backgroundColor: '#6366f1', borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function renderPerformanceTable(data, period, year, month, week) {
  const tbody = document.getElementById('performance-body');

  let periodLabel = 'All Time';
  if (period === 'monthly') {
    const mName = new Date(year, month - 1).toLocaleString('en-PH', { month: 'long' });
    periodLabel = `${mName} ${year}`;
  } else if (period === 'weekly' && week) {
    const start = new Date(week);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    const fmt   = d => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    periodLabel = `Week of ${fmt(start)}`;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">No responder data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(r => {
    const responseTime   = r.avg_response_time_minutes  != null ? `${r.avg_response_time_minutes} min`  : '—';
    const resolutionTime = r.avg_resolution_minutes     != null ? `${r.avg_resolution_minutes} min`     : '—';
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
