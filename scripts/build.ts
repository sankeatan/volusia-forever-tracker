// Assemble dist/ for static hosting: the site, the latest snapshot, a summary, the change log and status.
import { cp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES } from './sources.ts';
import { CHANGES, ROOT, SNAPSHOTS, STATUS_FILE, readJson, writeJson } from './lib.ts';
import type { FeatureCollection, Status } from './lib.ts';

const DIST = join(ROOT, 'dist');
const status = await readJson<Status>(STATUS_FILE).catch(() => null);
const snapshot = status?.last_snapshot;

await rm(DIST, { recursive: true, force: true });
await cp(join(ROOT, 'site'), DIST, { recursive: true });
await writeJson(join(DIST, 'data', 'status.json'), status ?? { ok: false, errors: ['No snapshot has been taken yet.'] });

if (snapshot) {
  const snapshotPath = `data/snapshots/${snapshot}`;
  await cp(join(SNAPSHOTS, snapshot), join(DIST, snapshotPath), { recursive: true });

  const acqSource = SOURCES.find((s) => s.name === 'vf_acquisitions')!;
  const acq = await readJson<FeatureCollection>(join(SNAPSHOTS, snapshot, `${acqSource.name}.geojson`));
  const parcels = await readJson<FeatureCollection>(join(SNAPSHOTS, snapshot, 'conservation_lands.geojson'));

  // Totals use the layer's own fields as published; categories are trimmed of stray whitespace only.
  const tally = (fc: FeatureCollection, field: string, acresField?: string) => {
    const out: Record<string, { count: number; acres: number }> = {};
    for (const f of fc.features) {
      const k = String(f.properties[field] ?? '(blank)').trim() || '(blank)';
      out[k] ??= { count: 0, acres: 0 };
      out[k].count++;
      if (acresField) out[k].acres += Number(f.properties[acresField] ?? 0);
    }
    return out;
  };
  const sum = (field: string) => acq.features.reduce((s, f) => s + Number(f.properties[field] ?? 0), 0);

  await writeJson(join(DIST, 'data', 'summary.json'), {
    snapshot,
    snapshot_path: snapshotPath,
    layers: Object.fromEntries(SOURCES.map((s) => [s.name, { title: s.title, file: `${snapshotPath}/${s.name}.geojson`, source_url: s.url }])),
    acquisitions: {
      source_url: acqSource.url,
      file: `${snapshotPath}/${acqSource.name}.geojson`,
      records: acq.features.length,
      acreage_field_total: sum('Acreage'),
      acres_field_total: sum('Acres'),
      total_investment: sum('Total_Investment'),
      by_acquisition_type: tally(acq, 'AcquisitionType', 'Acreage'),
      by_fund_program: tally(acq, 'FundProgram', 'Acreage'),
    },
    conservation_lands: {
      source_url: SOURCES.find((s) => s.name === 'conservation_lands')!.url,
      file: `${snapshotPath}/conservation_lands.geojson`,
      features: parcels.features.length,
      unique_parcels: new Set(parcels.features.map((f) => f.properties.PID)).size,
      by_use_code: tally(parcels, 'USECODE', 'ACREAGE'),
    },
  });
}

const changeFiles = (await readdir(CHANGES).catch(() => [])).filter((f) => f.endsWith('.json')).sort().reverse();
const changes = await Promise.all(changeFiles.map(async (f) => ({ file: `data/changes/${f}`, ...(await readJson<object>(join(CHANGES, f))) })));
await writeJson(join(DIST, 'data', 'changes.json'), changes);
if (changeFiles.length) await cp(CHANGES, join(DIST, 'data', 'changes'), { recursive: true });

console.log(`Built dist/ from snapshot ${snapshot ?? '(none)'} with ${changes.length} change file(s).`);
