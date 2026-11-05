import { esc, fmtNum, getJson, renderStatus } from './common.js';

const HOLDING_COLORS = {
  'Fee Simple': '#2e7d32',
  'Conservation Easement': '#c26a00',
  'Working Forest & Farmland': '#6d4fa3',
};
const OTHER_COLOR = '#5f6b7a';

// Staff usernames and private individuals' names stay in the raw snapshots but aren't surfaced in the UI.
const HIDDEN_FIELDS = new Set(['OBJECTID', 'created_user', 'last_edited_user', 'Applicant', 'OwnerName', 'GlobalID', 'Shape.STArea()', 'Shape.STLength()', 'SHAPE.STArea()', 'SHAPE.STLength()', 'ConservationArea']);
const DATE_FIELDS = new Set(['created_date', 'last_edited_date']);
const MONEY_FIELDS = new Set(['VolusiaContribution', 'PartnerContribution', 'Total_Investment']);

const DATASETS = {
  vf_acquisitions: {
    tab: 'Volusia Forever acquisitions',
    key: 'GlobalID',
    label: 'PropertyKnownAs',
    columns: [['PropertyKnownAs', 'Property'], ['ProjectName', 'Project'], ['AcquisitionType', 'Holding type'], ['AcquitionYear', 'Year'], ['Acreage', 'Acreage'], ['Ownership', 'Owner'], ['FundProgram', 'Program'], ['Total_Investment', 'Investment']],
    style: (p) => {
      const c = HOLDING_COLORS[String(p.AcquisitionType ?? '').trim()] ?? OTHER_COLOR;
      return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.45 };
    },
    onByDefault: true,
  },
  conservation_lands: {
    tab: 'Conservation land parcels',
    key: 'PID',
    label: 'CONSERVE_NAME',
    columns: [['PID', 'Parcel ID'], ['CONSERVE_NAME', 'Area'], ['ALIASNAME', 'Alias'], ['OWNER', 'Owner'], ['USECODE', 'Use'], ['DATE_ACQUIRED', 'Acquired'], ['ACREAGE', 'Acres']],
    style: () => ({ color: '#0f766e', weight: 0.6, fillColor: '#14b8a6', fillOpacity: 0.15 }),
  },
  vf_priority_projects: {
    tab: 'Priority projects',
    key: 'GlobalID',
    label: 'Project_Name',
    columns: [['Project_Name', 'Project'], ['List', 'List'], ['AcquisitionType', 'Type'], ['GIS_Acres', 'GIS acres']],
    style: () => ({ color: '#b91c1c', weight: 2, dashArray: '5 4', fillColor: '#ef4444', fillOpacity: 0.08 }),
  },
  vf_applicants: {
    tab: 'Applicants',
    key: 'GlobalID',
    label: 'ProjectName',
    columns: [['Tracking_No', 'Tracking no.'], ['ProjectName', 'Project'], ['PropertyLocation', 'Parcel ID'], ['Type', 'Type'], ['ESL_Forest_Farm', 'Category'], ['Applicant_Nominee', 'Applicant / nominee'], ['Acres', 'Acres']],
    style: () => ({ color: '#475569', weight: 1, dashArray: '2 3', fillColor: '#94a3b8', fillOpacity: 0.12 }),
  },
};

await renderStatus();
let summary = null;
try {
  summary = await getJson('data/summary.json');
} catch {
  document.getElementById('cards').innerHTML = '<p class="note">No snapshot is available yet.</p>';
}

function formatValue(field, v) {
  if (v === null || v === undefined || String(v).trim() === '') return '';
  if (DATE_FIELDS.has(field)) return new Date(v).toISOString().slice(0, 10);
  if (MONEY_FIELDS.has(field)) return '$' + fmtNum(v);
  if (typeof v === 'number' && !Number.isInteger(v)) return fmtNum(v, 1);
  return String(v);
}

// ---------- Summary cards ----------
function renderSummary() {
  const a = summary.acquisitions;
  const types = a.by_acquisition_type;
  const card = (label, value, sub, color) =>
    `<div class="card">${color ? `<span class="swatch" style="background:${color}"></span>` : ''}<div class="card-label">${esc(label)}</div><div class="card-value">${value}</div><div class="card-sub">${sub}</div></div>`;
  const typeCard = (name) => {
    const t = types[name] ?? { count: 0, acres: 0 };
    return card(name, `${fmtNum(t.acres)} ac`, `${t.count} record${t.count === 1 ? '' : 's'}`, HOLDING_COLORS[name]);
  };
  const other = Object.keys(types).filter((k) => !HOLDING_COLORS[k]);
  const plural = (n) => `${n} record${n === 1 ? '' : 's'}`;

  // The acquisitions layer mixes Volusia Forever purchases with the earlier Endangered Land Program,
  // so the headline splits them by the county's FundProgram field instead of adding them together.
  const programs = Object.entries(a.by_fund_program);
  const vf = programs.filter(([k]) => k.startsWith('Volusia Forever'));
  const earlier = programs.filter(([k]) => !k.startsWith('Volusia Forever'));
  const programCard = (label, list) => {
    const acres = list.reduce((s, [, v]) => s + v.acres, 0);
    const count = list.reduce((s, [, v]) => s + v.count, 0);
    return card(label, `${fmtNum(acres)} ac`, `${plural(count)} · ${list.map(([k]) => esc(k)).join(', ')}`);
  };
  const park = a.park_flagged;
  const parkPrograms = [...new Set(park.records.map((r) => r.program))];

  document.getElementById('cards').innerHTML =
    '<h2 class="cards-h">By program</h2><div class="cards">' +
    [
      programCard('Volusia Forever', vf),
      ...earlier.map(([k, v]) => programCard(k === 'Endangered Land Program' ? 'Endangered Land Program (before Volusia Forever)' : k, [[k, v]])),
      card('Flagged by the county as park land, not conservation', `${fmtNum(park.acreage_field_total)} ac`, `${plural(park.records.length)}${parkPrograms.length ? `, all ${parkPrograms.map(esc).join(', ')}` : ''} · counted above`),
      card('Acquisitions layer, all records', `${fmtNum(a.acreage_field_total)} ac`, `${plural(a.records)} · $${fmtNum(a.total_investment / 1e6, 1)}M total investment`),
    ].join('') +
    '</div><h2 class="cards-h">By holding type</h2><div class="cards">' +
    [
      ...Object.keys(HOLDING_COLORS).map(typeCard),
      ...other.map(typeCard),
      card('Conservation land parcels', fmtNum(summary.conservation_lands.unique_parcels), 'parcel IDs, all public and private conservation owners'),
    ].join('') +
    '</div>';

  const parkList = (list) => list.map((r) => `<li>${esc(r.name)} (${esc(r.program)}, ${fmtNum(r.acreage)} ac)${r.note ? `: ${esc(r.note)}` : ''}</li>`).join('');
  document.getElementById('summary-note').innerHTML =
    `Acreage is the county's <code>Acreage</code> field. The layer's <code>Acres</code> field (polygon area) totals ${fmtNum(a.acres_field_total)} ac; neither is surveyed acreage. ` +
    `Park-land flags come from the layer's <code>PriorityArea</code> field as published. ` +
    `Computed from <a href="${esc(a.file)}">snapshot ${esc(summary.snapshot)}</a> of the <a href="${esc(a.source_url)}" rel="noopener">county acquisitions layer</a>.` +
    `<details><summary>Records flagged as park land</summary><ul>${parkList(park.records.map((r) => ({ ...r, note: '' })))}</ul>` +
    (park.partly_flagged.length ? `<p>Partly flagged (not counted in the park total):</p><ul>${parkList(park.partly_flagged)}</ul>` : '') +
    '</details>';

  document.getElementById('sources').innerHTML =
    'Sources: ' +
    Object.values(summary.layers).map((l) => `<a href="${esc(l.source_url)}" rel="noopener">${esc(l.title)}</a> ${l.file ? ` (<a href="${esc(l.file)}">snapshot</a>)` : ''}`).join(' · ');
}

// ---------- Data loading ----------
const cache = {};
function loadDataset(name) {
  cache[name] ??= getJson(summary.layers[name].file);
  return cache[name];
}

// ---------- Map ----------
const map = L.map('map', { preferCanvas: true, scrollWheelZoom: false }).setView([29.03, -81.18], 10);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
map.on('focus', () => map.scrollWheelZoom.enable());
map.on('blur', () => map.scrollWheelZoom.disable());

const mapLayers = {};
const featureIndex = {}; // dataset -> key -> [leaflet layers]

function popupHtml(name, props) {
  const ds = DATASETS[name];
  const layer = summary.layers[name];
  const rows = Object.entries(props)
    .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && formatValue(k, v) !== '')
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(formatValue(k, v))}</td></tr>`)
    .join('');
  const where = encodeURIComponent(`${ds.key}='${props[ds.key]}'`);
  return `<div class="popup"><h3>${esc(props[ds.label] || props[ds.key])}</h3><p class="muted">${esc(layer.title)}</p>
    <table>${rows}</table>
    <p class="popup-links"><a href="${esc(layer.source_url)}/query?where=${where}&outFields=*&f=html" target="_blank" rel="noopener">County record</a> · <a href="${esc(layer.file)}" target="_blank">Snapshot file</a></p></div>`;
}

for (const [name, ds] of Object.entries(DATASETS)) {
  const index = (featureIndex[name] = {});
  mapLayers[name] = L.geoJSON(null, {
    style: (f) => ds.style(f.properties),
    onEachFeature: (f, layer) => {
      layer.bindPopup(() => popupHtml(name, f.properties), { maxWidth: 340, maxHeight: 320 });
      (index[f.properties[ds.key]] ??= []).push(layer);
    },
  });
}

async function ensureOnMap(name) {
  const layer = mapLayers[name];
  if (!layer.getLayers().length) layer.addData(await loadDataset(name));
  if (!map.hasLayer(layer)) layer.addTo(map);
}

function addControls() {
  const overlays = {};
  for (const [name, ds] of Object.entries(DATASETS)) overlays[ds.tab] = mapLayers[name];
  L.control.layers(null, overlays, { collapsed: window.innerWidth < 700 }).addTo(map);
  map.on('overlayadd', (e) => {
    const name = Object.keys(mapLayers).find((n) => mapLayers[n] === e.layer);
    ensureOnMap(name);
  });

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = '<strong>Holding type</strong>' +
      Object.entries(HOLDING_COLORS).map(([k, c]) => `<div><span class="swatch" style="background:${c}"></span>${esc(k)}</div>`).join('');
    return div;
  };
  legend.addTo(map);
}

// ---------- Table ----------
let activeTab = 'vf_acquisitions';
let sort = { field: null, dir: 1 };
const searchInput = document.getElementById('search');
const MAX_ROWS = 300;

function renderTabs() {
  document.getElementById('tabs').innerHTML = Object.entries(DATASETS)
    .map(([name, ds]) => `<button role="tab" data-tab="${name}" aria-selected="${name === activeTab}">${esc(ds.tab)}</button>`)
    .join('');
}

async function renderTable() {
  const ds = DATASETS[activeTab];
  const table = document.getElementById('table');
  table.innerHTML = '<caption class="muted">Loading…</caption>';
  const fc = await loadDataset(activeTab);
  const q = searchInput.value.trim().toLowerCase();
  let rows = fc.features.map((f) => f.properties);
  if (q) rows = rows.filter((p) => ds.columns.some(([f]) => String(p[f] ?? '').toLowerCase().includes(q)));
  if (sort.field) {
    rows = [...rows].sort((a, b) => {
      const x = a[sort.field], y = b[sort.field];
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }
  document.getElementById('table-count').textContent =
    rows.length > MAX_ROWS ? `Showing ${MAX_ROWS} of ${fmtNum(rows.length)} (search to narrow)` : `${fmtNum(rows.length)} record${rows.length === 1 ? "" : "s"}`;

  const head = ds.columns
    .map(([f, label]) => {
      const aria = sort.field === f ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';
      return `<th scope="col" aria-sort="${aria}"><button data-sort="${f}">${esc(label)}</button></th>`;
    })
    .join('');
  const body = rows
    .slice(0, MAX_ROWS)
    .map((p) => `<tr data-key="${esc(p[ds.key])}" tabindex="0">${ds.columns.map(([f]) => `<td>${esc(formatValue(f, p[f]))}</td>`).join('')}</tr>`)
    .join('');
  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

async function focusFeature(key) {
  await ensureOnMap(activeTab);
  const layers = featureIndex[activeTab][key];
  if (!layers?.length) return;
  const bounds = L.featureGroup(layers).getBounds();
  map.fitBounds(bounds, { maxZoom: 15, padding: [20, 20] });
  layers[0].openPopup(bounds.getCenter());
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  sort = { field: null, dir: 1 };
  renderTabs();
  renderTable();
});
document.getElementById('table').addEventListener('click', (e) => {
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    const f = sortBtn.dataset.sort;
    sort = { field: f, dir: sort.field === f ? -sort.dir : 1 };
    return renderTable();
  }
  const row = e.target.closest('tr[data-key]');
  if (row) focusFeature(row.dataset.key);
});
document.getElementById('table').addEventListener('keydown', (e) => {
  const row = e.target.closest('tr[data-key]');
  if (row && e.key === 'Enter') focusFeature(row.dataset.key);
});
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 150);
});

if (summary) {
  renderSummary();
  addControls();
  for (const [name, ds] of Object.entries(DATASETS)) if (ds.onByDefault) await ensureOnMap(name);
  map.fitBounds(mapLayers.vf_acquisitions.getBounds(), { padding: [10, 10] });
  renderTabs();
  renderTable();
}
