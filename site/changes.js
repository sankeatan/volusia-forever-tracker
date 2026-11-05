import { esc, getJson, renderStatus } from './common.js';

const LAYER_TITLES = {
  vf_acquisitions: 'Volusia Forever Acquisitions',
  vf_applicants: 'Volusia Forever Applicants',
  vf_priority_projects: 'Volusia Forever Priority Projects',
  conservation_lands: 'Conservation Lands (parcels)',
};
// Don't surface private individuals' names in the log; they remain in the raw change files.
const HIDDEN_FIELDS = new Set(['Applicant', 'OwnerName']);

const show = (v) => (v === null || v === undefined || v === '' ? '(blank)' : String(v));

function fieldList(fields) {
  return Object.entries(fields)
    .filter(([k]) => !HIDDEN_FIELDS.has(k))
    .map(([k, { from, to }]) => `<li><code>${esc(k)}</code>: <del>${esc(show(from))}</del> → <ins>${esc(show(to))}</ins></li>`)
    .join('');
}

function itemHtml(kind, item) {
  const name = `<strong>${esc(item.label || '(unnamed)')}</strong> <span class="muted">${esc(item.key)}</span>`;
  if (kind === 'changed') {
    const details = item.fields
      ? fieldList(item.fields)
      : '<li>Multipart record changed; see the change file for before and after.</li>';
    const geom = item.geometry_changed ? '<li>Boundary (geometry) changed</li>' : '';
    return `<li>${name}<ul>${details}${geom}</ul></li>`;
  }
  return `<li>${name}</li>`;
}

function entryHtml(entry) {
  const sections = Object.entries(entry.layers)
    .map(([layer, r]) => {
      const group = (kind, label) =>
        r[kind].length ? `<h4 class="kind-${kind}">${label} (${r[kind].length})</h4><ul class="items">${r[kind].map((i) => itemHtml(kind, i)).join('')}</ul>` : '';
      return `<section class="layer"><h3>${esc(LAYER_TITLES[layer] ?? layer)}</h3>${group('removed', 'Removed')}${group('added', 'Added')}${group('changed', 'Changed')}</section>`;
    })
    .join('');
  return `<article class="entry" id="${esc(entry.date)}">
    <h2>${esc(entry.date)} <span class="muted">· ${entry.total} change${entry.total === 1 ? '' : 's'}</span></h2>
    <p class="muted">Compared snapshot ${esc(entry.compared.from)} with ${esc(entry.compared.to)}. <a href="${esc(entry.file)}">Raw change file</a></p>
    ${sections}</article>`;
}

const status = await renderStatus();
const log = document.getElementById('log');
const entries = await getJson('data/changes.json').catch(() => []);
log.innerHTML = entries.length
  ? entries.map(entryHtml).join('')
  : `<p class="empty">No changes detected yet.${status.last_snapshot ? ` Tracking has a snapshot as of ${esc(status.last_snapshot)}; changes appear here once a later snapshot differs.` : ''}</p>`;
