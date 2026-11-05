// Compare the two most recent snapshots and write data/changes/<date>.json when anything moved.
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { IGNORED_FIELDS, SOURCES } from './sources.ts';
import type { Source } from './sources.ts';
import { CHANGES, SNAPSHOTS, listSnapshots, readJson, writeJson } from './lib.ts';
import type { FeatureCollection } from './lib.ts';

type Piece = { props: Record<string, unknown>; geom: string };
type Group = { label: string; pieces: Piece[] };
type FieldDiff = Record<string, { from: unknown; to: unknown }>;

function stripIgnored(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([k]) => !IGNORED_FIELDS.has(k)));
}

function group(fc: FeatureCollection, src: Source): Map<string, Group> {
  const out = new Map<string, Group>();
  for (const f of fc.features) {
    const key = String(f.properties[src.key]);
    const piece = {
      props: stripIgnored(f.properties),
      geom: createHash('sha1').update(JSON.stringify(f.geometry)).digest('hex'),
    };
    const g = out.get(key) ?? { label: String(f.properties[src.label] ?? ''), pieces: [] };
    g.pieces.push(piece);
    out.set(key, g);
  }
  for (const g of out.values()) g.pieces.sort((a, b) => JSON.stringify(a.props).localeCompare(JSON.stringify(b.props)));
  return out;
}

function fieldDiff(a: Record<string, unknown>, b: Record<string, unknown>): FieldDiff {
  const diff: FieldDiff = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = { from: a[k] ?? null, to: b[k] ?? null };
  }
  return diff;
}

function diffLayer(before: Map<string, Group>, after: Map<string, Group>) {
  const added = [], removed = [], changed = [];
  for (const [key, g] of after) {
    if (!before.has(key)) added.push({ key, label: g.label, properties: g.pieces.map((p) => p.props) });
  }
  for (const [key, g] of before) {
    const next = after.get(key);
    if (!next) {
      removed.push({ key, label: g.label, properties: g.pieces.map((p) => p.props) });
      continue;
    }
    const geometryChanged = g.pieces.map((p) => p.geom).join() !== next.pieces.map((p) => p.geom).join();
    if (g.pieces.length === 1 && next.pieces.length === 1) {
      const fields = fieldDiff(g.pieces[0].props, next.pieces[0].props);
      if (Object.keys(fields).length || geometryChanged) changed.push({ key, label: next.label, fields, geometry_changed: geometryChanged });
    } else if (JSON.stringify(g.pieces) !== JSON.stringify(next.pieces)) {
      // Multipart record: report both versions whole rather than guess which piece became which.
      changed.push({
        key,
        label: next.label,
        pieces_before: g.pieces.map((p) => p.props),
        pieces_after: next.pieces.map((p) => p.props),
        geometry_changed: geometryChanged,
      });
    }
  }
  return { added, removed, changed };
}

const snapshots = await listSnapshots();
if (snapshots.length < 2) {
  console.log('Fewer than two snapshots; nothing to compare yet (this one is the baseline).');
} else {
  await writeChanges(snapshots.at(-2)!, snapshots.at(-1)!);
}

async function writeChanges(from: string, to: string) {
  const layers: Record<string, ReturnType<typeof diffLayer>> = {};
  let total = 0;

  for (const src of SOURCES) {
    const load = (d: string) => readJson<FeatureCollection>(join(SNAPSHOTS, d, `${src.name}.geojson`)).catch(() => null);
    const [a, b] = await Promise.all([load(from), load(to)]);
    if (!a || !b) {
      console.log(`${src.name}: missing in ${!a ? from : to}, skipped`);
      continue;
    }
    const result = diffLayer(group(a, src), group(b, src));
    const n = result.added.length + result.removed.length + result.changed.length;
    total += n;
    if (n) layers[src.name] = result;
    console.log(`${src.name}: +${result.added.length} -${result.removed.length} ~${result.changed.length}`);
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
