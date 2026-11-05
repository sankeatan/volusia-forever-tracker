// A day and a half covers one missed cron run without crying wolf.
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fmtNum = (n, digits = 0) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';

export async function getJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function renderStatus() {
  const statusEl = document.getElementById('status');
  const banner = document.getElementById('banner');
  let status;
  try {
    status = await getJson('data/status.json');
  } catch {
    status = { ok: false, errors: ['Status file could not be loaded.'] };
  }

  statusEl.innerHTML = status.last_success
    ? `Data last updated <strong>${esc(fmtDateTime(status.last_success))}</strong>`
    : 'No successful data update yet.';

  const stale = !status.last_success || Date.now() - Date.parse(status.last_success) > STALE_AFTER_MS;
  if (!status.ok || stale) {
    const when = status.last_attempt ? ` The last attempt was ${esc(fmtDateTime(status.last_attempt))}.` : '';
    banner.innerHTML = `<strong>Data may be out of date.</strong> The most recent check of the county's data did not succeed.${when} The figures below are from the last successful snapshot.`;
    banner.hidden = false;
  }
  return status;
}
