import { esc, fmtNum, getJson, renderStatus } from './common.js';

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

const pct = (share) => `${Math.round(share * 100)}%`;
function others(by) {
  const names = by.slice(0, 3).map((o) => `${esc(o.label || '(unnamed)')} <span class="muted">${esc(o.key)}</span>`).join(', ');
  return by.length > 3 ? `${names} and ${by.length - 3} more` : names;
}

// Whether the land itself left or entered the layer, judged by overlap with the other snapshot.
function coverageHtml(c) {
  if (!c) return '';
  const text = {
    gone: '<strong>Land no longer in this layer</strong>',
    partly_mapped: `Partly still in this layer: ${pct(c.share)} now under ${others(c.by)}`,
    still_mapped: `Land still in this layer under ${others(c.by)}; likely re-parceled or merged`,
    new: '<strong>New land in this layer</strong>',
    partly_new: `Partly new: ${pct(c.share)} was already under ${others(c.by)}`,
    previously_mapped: `Land was already in this layer under ${others(c.by)}; likely re-parceled`,
    unknown: 'Overlap could not be checked (no usable outline)',
  }[c.status];
  return text ? `<div class="coverage cov-${esc(c.status)}">${text}</div>` : '';
}

function itemHtml(kind, item) {
  const acres = item.acres != null ? ` <span class="muted">· ${esc(fmtNum(item.acres, 2))} ac</span>` : '';
  const was = item.previous_key ? ` <span class="muted">(was ${esc(item.previous_key)})</span>` : '';
  const name = `<strong>${esc(item.label || '(unnamed)')}</strong> <span class="muted">${esc(item.key)}</span>${was}${kind === 'changed' ? '' : acres}`;
  if (kind === 'changed') {
    const details = item.fields
      ? fieldList(item.fields)
      : '<li>Multipart record changed; see the change file for before and after.</li>';
    const geom = item.geometry_changed ? '<li>Boundary (geometry) changed</li>' : '';
    return `<li>${name}<ul>${details}${geom}</ul></li>`;
  }
  return `<li>${name}${coverageHtml(item.coverage)}</li>`;
}

const material = (r) => r.added.length + r.removed.length + r.changed.length;

function entryHtml(entry) {
  const sections = Object.entries(entry.layers)
    .map(([layer, r]) => {
      const group = (kind, label) =>
        r[kind].length ? `<h4 class="kind-${kind}">${label} (${r[kind].length})</h4><ul class="items">${r[kind].map((i) => itemHtml(kind, i)).join('')}</ul>` : '';
      const rekeyed = r.rekeyed ?? [];
      const reload = r.reload
        ? `<p class="callout">Most of this layer's record IDs changed at once. That usually means the county reloaded the layer, not that land changed. Records with identical land and attributes are listed as re-keyed; anything still listed as removed or added below differs in some way.</p>`
        : '';
      const fieldNames = (list) => list.map((f) => `<code>${esc(f)}</code>`).join(', ');
      const schema = r.schema
        ? `<p class="callout">The county changed this layer's fields.${r.schema.added_fields.length ? ` Added: ${fieldNames(r.schema.added_fields)}.` : ''}${r.schema.removed_fields.length ? ` Removed: ${fieldNames(r.schema.removed_fields)}.` : ''} Those fields are left out of the per-record edits below.</p>`
        : '';
      const rekeyedHtml = rekeyed.length
        ? `<details><summary>Re-keyed: same land and attributes under a new ID (${rekeyed.length})</summary><ul class="items">${rekeyed.map((x) => `<li>${esc(x.label || '(unnamed)')} <span class="muted">${esc(x.from)} → ${esc(x.to)}</span></li>`).join('')}</ul></details>`
        : '';
      return `<section class="layer"><h3>${esc(LAYER_TITLES[layer] ?? layer)}</h3>${reload}${schema}${group('removed', 'Removed')}${group('added', 'Added')}${group('changed', 'Changed')}${rekeyedHtml}</section>`;
    })
    .join('');
  const layers = Object.values(entry.layers);
  const count = layers.reduce((s, r) => s + material(r), 0);
  const rekeyedCount = layers.reduce((s, r) => s + (r.rekeyed?.length ?? 0), 0);
  const schemaCount = layers.filter((r) => r.schema).length;
  return `<article class="entry" id="${esc(entry.date)}">
    <h2>${esc(entry.date)} <span class="muted">· ${count} change${count === 1 ? '' : 's'}${rekeyedCount ? `, ${rekeyedCount} re-keyed` : ''}${schemaCount ? `, field changes in ${schemaCount} layer${schemaCount === 1 ? '' : 's'}` : ''}</span></h2>
    <p class="muted">Compared snapshot ${esc(entry.compared.from)} with ${esc(entry.compared.to)}. <a href="${esc(entry.file)}">Raw change file</a></p>
    ${sections}</article>`;
}

const status = await renderStatus();
const log = document.getElementById('log');
const entries = await getJson('data/changes.json').catch(() => []);
log.innerHTML = entries.length
  ? entries.map(entryHtml).join('')
  : `<p class="empty">No changes detected yet.${status.last_snapshot ? ` Tracking has a snapshot as of ${esc(status.last_snapshot)}; changes appear here once a later snapshot differs.` : ''}</p>`;
