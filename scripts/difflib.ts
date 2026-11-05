// Pure diff logic for two snapshots of one layer. scripts/diff.ts is the CLI around it.
import { createHash } from 'node:crypto';
import { IGNORED_FIELDS, RELOAD_FIELDS } from './sources.ts';
import type { Source } from './sources.ts';
import type { FeatureCollection } from './lib.ts';

type Props = Record<string, unknown>;
type Piece = { props: Props; geom: string; geometry: unknown };
type Group = { label: string; pieces: Piece[] };
type FieldDiff = Record<string, { from: unknown; to: unknown }>;

// A removed record whose land is at least this share covered by records still in the layer was
// re-parceled or merged, not dropped. Below the lower bound the land is gone from the layer.
export const STILL_MAPPED = 0.95;
export const NOT_MAPPED = 0.05;
// When at least this share of a layer's keys churn in one day, the county most likely reloaded it.
export const RELOAD_SHARE = 0.5;

export type Coverage = {
  status: 'gone' | 'partly_mapped' | 'still_mapped' | 'new' | 'partly_new' | 'previously_mapped' | 'unknown';
  share: number | null;
  by: { key: string; label: string }[];
};
export type Entry = { key: string; label: string; acres: number | null; properties: Props[]; coverage: Coverage; geometry?: unknown[] };
export type LayerDiff = {
  added: Entry[];
  removed: Entry[];
  changed: Record<string, unknown>[];
  rekeyed: { from: string; to: string; label: string }[];
  schema?: { added_fields: string[]; removed_fields: string[] };
  reload?: boolean;
};

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex');
const isDerived = (k: string) => /\.ST(Area|Length)\(\)$/i.test(k);

function fieldsOf(fc: FeatureCollection) {
  const out = new Set<string>();
  for (const f of fc.features) for (const k of Object.keys(f.properties)) if (!IGNORED_FIELDS.has(k)) out.add(k);
  return out;
}

function group(fc: FeatureCollection, src: Source): Map<string, Group> {
  const out = new Map<string, Group>();
  for (const f of fc.features) {
    const key = String(f.properties[src.key]);
    const props = Object.fromEntries(Object.entries(f.properties).filter(([k]) => !IGNORED_FIELDS.has(k)));
    const g = out.get(key) ?? { label: String(f.properties[src.label] ?? ''), pieces: [] };
    g.pieces.push({ props, geom: hash(f.geometry), geometry: f.geometry });
    out.set(key, g);
  }
  for (const g of out.values()) g.pieces.sort((a, b) => JSON.stringify(a.props).localeCompare(JSON.stringify(b.props)));
  return out;
}

function fieldDiff(a: Props, b: Props, skip: Set<string>): FieldDiff {
  const diff: FieldDiff = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!skip.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = { from: a[k] ?? null, to: b[k] ?? null };
  }
  return diff;
}

// Same land and same attributes apart from the record key and reload-managed fields.
function signature(g: Group, skip: Set<string>) {
  // Sorted after filtering: per-piece reload fields would otherwise reorder a multipart record's pieces.
  return hash(g.pieces.map((p) => JSON.stringify([Object.entries(p.props).filter(([k]) => !RELOAD_FIELDS.has(k) && !isDerived(k) && !skip.has(k)), p.geom])).sort());
}

const geomKey = (g: Group) => g.pieces.map((p) => p.geom).sort().join();
// Order-independent fingerprint of a multipart record, ignoring fields the county added or dropped.
const comparable = (g: Group, skip: Set<string>) =>
  g.pieces.map((p) => JSON.stringify([Object.entries(p.props).filter(([k]) => !skip.has(k)), p.geom])).sort().join('\n');

// ---------- Coverage: how much of a record's land is covered by another set of records ----------
type Ring = number[][];
type Polys = Ring[][]; // polygons, each an outer ring plus holes
type BBox = [number, number, number, number];

function polygons(geometry: any): Polys {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function bbox(polys: Polys): BBox | null {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const [x, y] of poly[0] ?? []) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b[0] === Infinity ? null : b;
}

function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolys = (x: number, y: number, polys: Polys) =>
  polys.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((hole) => inRing(x, y, hole)));

const inBox = (x: number, y: number, b: BBox) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

// Grid points inside the shape, offset half a cell so they never sit on a shared boundary.
function samplePoints(polys: Polys) {
  const b = bbox(polys);
  if (!b) return [];
  for (const n of [20, 60]) {
    const pts: [number, number][] = [];
    const dx = (b[2] - b[0]) / n, dy = (b[3] - b[1]) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = b[0] + (i + 0.5) * dx, y = b[1] + (j + 0.5) * dy;
      if (inPolys(x, y, polys)) pts.push([x, y]);
    }
    if (pts.length) return pts;
  }
  return [];
}

type Indexed = { key: string; label: string; polys: Polys; box: BBox };

function index(groups: Map<string, Group>): Indexed[] {
  const out: Indexed[] = [];
  for (const [key, g] of groups) {
    for (const p of g.pieces) {
      const polys = polygons(p.geometry);
      const box = bbox(polys);
      if (box) out.push({ key, label: g.label, polys, box });
    }
  }
  return out;
}

function coverage(g: Group, others: Indexed[]): { share: number | null; by: { key: string; label: string }[] } {
  const pts = g.pieces.flatMap((p) => samplePoints(polygons(p.geometry)));
  if (!pts.length) return { share: null, by: [] };
  const by = new Map<string, string>();
  let hit = 0;
  for (const [x, y] of pts) {
    const match = others.find((o) => inBox(x, y, o.box) && inPolys(x, y, o.polys));
    if (match) {
      hit++;
      by.set(match.key, match.label);
    }
  }
  return { share: Math.round((hit / pts.length) * 100) / 100, by: [...by].map(([key, label]) => ({ key, label })) };
}

function classify(share: number | null, labels: [Coverage['status'], Coverage['status'], Coverage['status']]): Coverage['status'] {
  if (share === null) return 'unknown';
  return share >= STILL_MAPPED ? labels[2] : share >= NOT_MAPPED ? labels[1] : labels[0];
}

// ---------- Layer diff ----------
export function diffLayer(a: FeatureCollection, b: FeatureCollection, src: Source): LayerDiff {
  const fieldsBefore = fieldsOf(a), fieldsAfter = fieldsOf(b);
  const addedFields = [...fieldsAfter].filter((k) => !fieldsBefore.has(k)).sort();
  const removedFields = [...fieldsBefore].filter((k) => !fieldsAfter.has(k)).sort();
  // A field the county added or dropped is reported once for the layer, not as an edit to every record.
  const skip = new Set([...addedFields, ...removedFields]);
  const before = group(a, src), after = group(b, src);
  // The key itself is what a re-key changes, so it's left out when matching records across keys.
  const matchSkip = new Set([...skip, src.key]);

  const acresOf = (g: Group) => {
    const vals = g.pieces.map((p) => p.props[src.acres]).filter((v) => typeof v === 'number') as number[];
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100 : null;
  };

  // Pair removed and added records that carry identical land and attributes: the key changed, nothing else.
  // Then pair what's left by identical land alone, so an edit made during a reload still reads as an edit.
  const goneKeys = [...before.keys()].filter((k) => !after.has(k));
  const newKeys = [...after.keys()].filter((k) => !before.has(k));
  const newBySig = new Map<string, string[]>();
  for (const k of newKeys) {
    const sig = signature(after.get(k)!, matchSkip);
    newBySig.set(sig, [...(newBySig.get(sig) ?? []), k]);
  }
  const newByGeom = new Map<string, string[]>();
  const rekeyed: LayerDiff['rekeyed'] = [];
  const rekeyedFrom = new Set<string>(), rekeyedTo = new Set<string>();
  const edited: [string, string][] = [];
  for (const k of goneKeys) {
    const to = newBySig.get(signature(before.get(k)!, matchSkip))?.shift();
    if (!to) continue;
    rekeyed.push({ from: k, to, label: after.get(to)!.label });
    rekeyedFrom.add(k);
    rekeyedTo.add(to);
  }
  // Records without an outline all share one geometry hash, so they can't be paired by land.
  const hasLand = (g: Group) => g.pieces.some((p) => polygons(p.geometry).length);
  for (const k of newKeys) {
    if (rekeyedTo.has(k) || !hasLand(after.get(k)!)) continue;
    const g = geomKey(after.get(k)!);
    newByGeom.set(g, [...(newByGeom.get(g) ?? []), k]);
  }
  for (const k of goneKeys) {
    if (rekeyedFrom.has(k) || !hasLand(before.get(k)!)) continue;
    const to = newByGeom.get(geomKey(before.get(k)!))?.shift();
    if (!to) continue;
    edited.push([k, to]);
    rekeyedFrom.add(k);
    rekeyedTo.add(to);
  }

  const afterIndex = index(after);
  const beforeIndex = index(before);
  const entry = (key: string, g: Group, others: Indexed[], labels: [Coverage['status'], Coverage['status'], Coverage['status']], keepGeometry: boolean): Entry => {
    const c = coverage(g, others.filter((o) => o.key !== key));
    return {
      key,
      label: g.label,
      acres: acresOf(g),
      properties: g.pieces.map((p) => p.props),
      coverage: { status: classify(c.share, labels), share: c.share, by: c.by.slice(0, 10) },
      // Removed land is no longer in any published snapshot the site serves, so keep its outline here.
      ...(keepGeometry ? { geometry: g.pieces.map((p) => p.geometry) } : {}),
    };
  };

  const added = newKeys.filter((k) => !rekeyedTo.has(k)).map((k) => entry(k, after.get(k)!, beforeIndex, ['new', 'partly_new', 'previously_mapped'], false));
  const removed = goneKeys.filter((k) => !rekeyedFrom.has(k)).map((k) => entry(k, before.get(k)!, afterIndex, ['gone', 'partly_mapped', 'still_mapped'], true));

  const changed: Record<string, unknown>[] = [];
  const compare = (key: string, g: Group, next: Group, previousKey?: string) => {
    const was = previousKey ? { previous_key: previousKey } : {};
    const fieldSkip = previousKey ? matchSkip : skip;
    const geometryChanged = geomKey(g) !== geomKey(next);
    if (g.pieces.length === 1 && next.pieces.length === 1) {
      const fields = fieldDiff(g.pieces[0].props, next.pieces[0].props, fieldSkip);
      if (Object.keys(fields).length || geometryChanged) changed.push({ key, ...was, label: next.label, fields, geometry_changed: geometryChanged });
    } else if (comparable(g, fieldSkip) !== comparable(next, fieldSkip)) {
      // Multipart record: report both versions whole rather than guess which piece became which.
      changed.push({
        key,
        ...was,
        label: next.label,
        pieces_before: g.pieces.map((p) => p.props),
        pieces_after: next.pieces.map((p) => p.props),
        geometry_changed: geometryChanged,
      });
    }
  };
  for (const [key, g] of before) if (after.has(key)) compare(key, g, after.get(key)!);
  for (const [from, to] of edited) compare(to, before.get(from)!, after.get(to)!, from);

  const result: LayerDiff = { added, removed, changed, rekeyed };
  if (skip.size) result.schema = { added_fields: addedFields, removed_fields: removedFields };
  const churnBefore = (removed.length + rekeyedFrom.size) / Math.max(before.size, 1);
  const churnAfter = (added.length + rekeyedTo.size) / Math.max(after.size, 1);
  if (churnBefore >= RELOAD_SHARE && churnAfter >= RELOAD_SHARE) result.reload = true;
  return result;
}

export const changeCount = (d: LayerDiff) => d.added.length + d.removed.length + d.changed.length + d.rekeyed.length + (d.schema ? 1 : 0);
