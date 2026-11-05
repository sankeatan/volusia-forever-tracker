// Compare the two most recent snapshots and write data/changes/<date>.json when anything moved.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES } from './sources.ts';
import { changeCount, diffLayer } from './difflib.ts';
import type { LayerDiff } from './difflib.ts';
import { CHANGES, SNAPSHOTS, listSnapshots, readJson, writeJson } from './lib.ts';
import type { FeatureCollection } from './lib.ts';

const snapshots = await listSnapshots();
if (snapshots.length < 2) {
  console.log('Fewer than two snapshots; nothing to compare yet (this one is the baseline).');
} else {
  await writeChanges(snapshots.at(-2)!, snapshots.at(-1)!);
}

async function writeChanges(from: string, to: string) {
  const layers: Record<string, LayerDiff> = {};
  let total = 0;

  for (const src of SOURCES) {
    const load = (d: string) => readJson<FeatureCollection>(join(SNAPSHOTS, d, `${src.name}.geojson`)).catch(() => null);
    const [a, b] = await Promise.all([load(from), load(to)]);
    if (!a || !b) {
      console.log(`${src.name}: missing in ${!a ? from : to}, skipped`);
      continue;
    }
    const result = diffLayer(a, b, src);
    const n = changeCount(result);
    total += n;
    if (n) layers[src.name] = result;
    const extras = [result.rekeyed.length ? `re-keyed ${result.rekeyed.length}` : '', result.schema ? 'schema changed' : '', result.reload ? 'LIKELY RELOAD' : '']
      .filter(Boolean)
      .join(', ');
    console.log(`${src.name}: +${result.added.length} -${result.removed.length} ~${result.changed.length}${extras ? ` (${extras})` : ''}`);
  }

  const out = join(CHANGES, `${to}.json`);
  if (total) {
    await writeJson(out, { date: to, compared: { from, to }, total, layers });
    console.log(`${total} change(s) written to data/changes/${to}.json`);
  } else {
    await rm(out, { force: true });
    console.log(`No changes between ${from} and ${to}.`);
  }
}
