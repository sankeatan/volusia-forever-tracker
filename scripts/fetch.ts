// Pull every source layer into data/snapshots/YYYY-MM-DD/<layer>.geojson.
// All layers land together or not at all; data/status.json records the outcome either way.
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SOURCES } from './sources.ts';
import type { Source } from './sources.ts';
import { SNAPSHOTS, STATUS_FILE, readJson, todayET, writeFeatureCollection, writeJson } from './lib.ts';
import type { Feature, Status } from './lib.ts';

const PAGE_SIZE = 1000;
const USER_AGENT = 'volusia-forever-tracker (independent public conservation tracker)';

async function getJson(url: string): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      // ArcGIS reports query errors with HTTP 200 and an error object.
      if (body.error) throw new Error(`ArcGIS error ${JSON.stringify(body.error)}`);
      return body;
    } catch (err) {
      if (attempt === 3) throw new Error(`${(err as Error).message} (${url})`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

async function fetchLayer(src: Source): Promise<Feature[]> {
  const { count } = await getJson(`${src.url}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const features: Feature[] = [];
  for (let offset = 0; offset < count; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      outSR: '4326',
      geometryPrecision: '6',
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: 'geojson',
    });
    const page = await getJson(`${src.url}/query?${params}`);
    features.push(...page.features);
  }
  if (features.length !== count) throw new Error(`${src.name}: expected ${count} features, got ${features.length}`);

  const sortKey = (f: Feature) => `${f.properties[src.key]}\u0000${String(f.properties.OBJECTID).padStart(10, '0')}`;
  return features.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

const date = todayET();
const now = new Date().toISOString();
const previous: Status | null = await readJson<Status>(STATUS_FILE).catch(() => null);
const tmp = join(SNAPSHOTS, `.tmp-${date}`);

try {
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const layers: Record<string, unknown> = {};
  for (const src of SOURCES) {
    const features = await fetchLayer(src);
    const file = join(tmp, `${src.name}.geojson`);
    await writeFeatureCollection(file, { type: 'FeatureCollection', features });
    const sha256 = createHash('sha256').update(await readFile(file)).digest('hex');
    layers[src.name] = { title: src.title, source_url: src.url, key: src.key, count: features.length, sha256 };
    console.log(`${src.name}: ${features.length} features`);
  }
  await writeJson(join(tmp, 'manifest.json'), { date, fetched_at: now, layers });

  const dest = join(SNAPSHOTS, date);
  await rm(dest, { recursive: true, force: true });
  await rename(tmp, dest);
  await writeJson(STATUS_FILE, { ok: true, last_attempt: now, last_success: now, last_snapshot: date, errors: [] } satisfies Status);
  console.log(`Snapshot written to data/snapshots/${date}`);
} catch (err) {
  await rm(tmp, { recursive: true, force: true });
  const status: Status = {
    ok: false,
    last_attempt: now,
    last_success: previous?.last_success ?? null,
    last_snapshot: previous?.last_snapshot ?? null,
    errors: [(err as Error).message],
  };
  await writeJson(STATUS_FILE, status);
  console.error(`Fetch failed: ${(err as Error).message}`);
  // exitCode rather than exit(): process.exit() trips a libuv assertion on Windows after fetch.
  process.exitCode = 1;
}
