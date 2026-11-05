import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLayer } from './difflib.ts';
import type { Source } from './sources.ts';
import type { Feature, FeatureCollection } from './lib.ts';

const src: Source = { name: 't', title: 'Test', url: 'https://example.test', key: 'PID', label: 'NAME', acres: 'ACRES' };

// Axis-aligned rectangle as a Polygon.
const box = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const feat = (properties: Record<string, unknown>, geometry: unknown = box(0, 0, 1, 1)): Feature => ({ type: 'Feature', geometry, properties });
const fc = (...features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });

test('identical snapshots produce no changes', () => {
  const a = fc(feat({ PID: '1', NAME: 'A', ACRES: 10 }));
  const d = diffLayer(a, structuredClone(a), src);
  assert.deepEqual([d.added, d.removed, d.changed, d.rekeyed], [[], [], [], []]);
  assert.equal(d.schema, undefined);
  assert.equal(d.reload, undefined);
});

test('OBJECTID renumbering is not a change', () => {
  const d = diffLayer(fc(feat({ OBJECTID: 1, PID: '1', NAME: 'A' })), fc(feat({ OBJECTID: 99, PID: '1', NAME: 'A' })), src);
  assert.equal(d.changed.length, 0);
});

test('field edit and boundary change are reported', () => {
  const d = diffLayer(fc(feat({ PID: '1', NAME: 'A', OWNER: 'County' })), fc(feat({ PID: '1', NAME: 'A', OWNER: 'Private' }, box(0, 0, 2, 1))), src);
  assert.deepEqual(d.changed, [{ key: '1', label: 'A', fields: { OWNER: { from: 'County', to: 'Private' } }, geometry_changed: true }]);
});

test('land that leaves the layer is "gone" and keeps its outline', () => {
  const a = fc(feat({ PID: '1', NAME: 'A', ACRES: 10 }), feat({ PID: '2', NAME: 'B', ACRES: 1 }, box(5, 5, 6, 6)));
  const b = fc(feat({ PID: '2', NAME: 'B', ACRES: 1 }, box(5, 5, 6, 6)));
  const d = diffLayer(a, b, src);
  assert.equal(d.removed.length, 1);
  assert.equal(d.removed[0].coverage.status, 'gone');
  assert.equal(d.removed[0].coverage.share, 0);
  assert.equal(d.removed[0].acres, 10);
  assert.deepEqual(d.removed[0].geometry, [box(0, 0, 1, 1)]);
  assert.equal(d.reload, undefined);
});

test('new land that was not mapped before is "new"', () => {
  const d = diffLayer(fc(feat({ PID: '1', NAME: 'A' })), fc(feat({ PID: '1', NAME: 'A' }), feat({ PID: '2', NAME: 'B' }, box(5, 5, 6, 6))), src);
  assert.equal(d.added[0].coverage.status, 'new');
  assert.equal(d.added[0].geometry, undefined);
});

test('a parcel split into two new IDs is re-parceled, not lost', () => {
  const keep = feat({ PID: '9', NAME: 'Other' }, box(10, 10, 11, 11));
  const a = fc(feat({ PID: '1', NAME: 'Whole' }), keep);
  const b = fc(feat({ PID: '1a', NAME: 'West' }, box(0, 0, 0.5, 1)), feat({ PID: '1b', NAME: 'East' }, box(0.5, 0, 1, 1)), keep);
  const d = diffLayer(a, b, src);
  assert.equal(d.removed[0].coverage.status, 'still_mapped');
  assert.deepEqual(d.removed[0].coverage.by.map((x) => x.key).sort(), ['1a', '1b']);
  assert.deepEqual(d.added.map((x) => x.coverage.status), ['previously_mapped', 'previously_mapped']);
});

test('a partial loss is reported with its covered share', () => {
  const keep = feat({ PID: '9', NAME: 'Other' }, box(10, 10, 11, 11));
  const a = fc(feat({ PID: '1', NAME: 'Whole' }), keep);
  const b = fc(feat({ PID: '1a', NAME: 'West' }, box(0, 0, 0.5, 1)), keep);
  const d = diffLayer(a, b, src);
  assert.equal(d.removed[0].coverage.status, 'partly_mapped');
  assert.equal(d.removed[0].coverage.share, 0.5);
});

test('a record whose key changed but nothing else is re-keyed, and a full re-key flags a reload', () => {
  const a = fc(
    feat({ GlobalID: '{A}', NAME: 'A', last_edited_date: 1 }),
    feat({ GlobalID: '{B}', NAME: 'B', last_edited_date: 1 }, box(5, 5, 6, 6)),
  );
  const b = fc(
    feat({ GlobalID: '{X}', NAME: 'A', last_edited_date: 2 }),
    feat({ GlobalID: '{Y}', NAME: 'B', last_edited_date: 2 }, box(5, 5, 6, 6)),
  );
  const d = diffLayer(a, b, { ...src, key: 'GlobalID' });
  assert.deepEqual(d.rekeyed, [{ from: '{A}', to: '{X}', label: 'A' }, { from: '{B}', to: '{Y}', label: 'B' }]);
  assert.equal(d.added.length + d.removed.length, 0);
  assert.equal(d.reload, true);
});

test('one re-keyed record among many is not a reload', () => {
  const others = Array.from({ length: 9 }, (_, i) => feat({ GlobalID: `{K${i}}`, NAME: `K${i}` }, box(i * 2, 20, i * 2 + 1, 21)));
  const d = diffLayer(fc(feat({ GlobalID: '{A}', NAME: 'A' }), ...others), fc(feat({ GlobalID: '{X}', NAME: 'A' }), ...others), { ...src, key: 'GlobalID' });
  assert.equal(d.rekeyed.length, 1);
  assert.equal(d.reload, undefined);
});

test('a field added to every record is one schema change, not an edit to each record', () => {
  const a = fc(feat({ PID: '1', NAME: 'A' }), feat({ PID: '2', NAME: 'B' }, box(5, 5, 6, 6)));
  const b = fc(feat({ PID: '1', NAME: 'A', NEW: 'x' }), feat({ PID: '2', NAME: 'B', NEW: 'y' }, box(5, 5, 6, 6)));
  const d = diffLayer(a, b, src);
  assert.deepEqual(d.schema, { added_fields: ['NEW'], removed_fields: [] });
  assert.equal(d.changed.length, 0);
});

test('a multipart parcel reports both versions whole', () => {
  const a = fc(feat({ PID: '1', NAME: 'A', AREA: 'North' }), feat({ PID: '1', NAME: 'A', AREA: 'South' }, box(0, 1, 1, 2)));
  const b = fc(feat({ PID: '1', NAME: 'A', AREA: 'North' }), feat({ PID: '1', NAME: 'A', AREA: 'East' }, box(0, 1, 1, 2)));
  const [c] = diffLayer(a, b, src).changed as any[];
  assert.deepEqual(c.pieces_after.map((p: any) => p.AREA), ['East', 'North']);
  assert.equal(c.geometry_changed, false);
});

test('a parcel ID change on unchanged land is a re-key', () => {
  const d = diffLayer(fc(feat({ PID: '1', NAME: 'A' })), fc(feat({ PID: '2', NAME: 'A' })), src);
  assert.deepEqual(d.rekeyed, [{ from: '1', to: '2', label: 'A' }]);
});

test('an edit made during a reload is reported as an edit on the re-keyed record', () => {
  const a = fc(feat({ GlobalID: '{A}', NAME: 'A', Ownership: 'County' }));
  const b = fc(feat({ GlobalID: '{X}', NAME: 'A', Ownership: 'Private' }));
  const d = diffLayer(a, b, { ...src, key: 'GlobalID' });
  assert.equal(d.added.length + d.removed.length + d.rekeyed.length, 0);
  assert.deepEqual(d.changed, [{ key: '{X}', previous_key: '{A}', label: 'A', fields: { Ownership: { from: 'County', to: 'Private' } }, geometry_changed: false }]);
  assert.equal(d.reload, true);
});

test('a multipart record re-keyed with per-piece reload fields that reorder its pieces is still a re-key', () => {
  const piece = (gid: string, area: string, geom: unknown) => feat({ PID: 'P', GlobalID: gid, NAME: 'A', AREA: area }, geom);
  const a = fc(piece('{1}', 'North', box(0, 0, 1, 1)), piece('{2}', 'South', box(0, 1, 1, 2)));
  const b = fc(piece('{Z}', 'North', box(0, 0, 1, 1)), piece('{A}', 'South', box(0, 1, 1, 2)));
  for (const f of b.features) f.properties.PID = 'Q';
  const d = diffLayer(a, b, src);
  assert.deepEqual(d.rekeyed, [{ from: 'P', to: 'Q', label: 'A' }]);
  assert.equal(d.changed.length, 0);
});

test('records without geometry are never paired by land', () => {
  const d = diffLayer(fc(feat({ PID: '1', NAME: 'A' }, null)), fc(feat({ PID: '2', NAME: 'B' }, null)), src);
  assert.equal(d.changed.length, 0);
  assert.equal(d.removed[0].coverage.status, 'unknown');
  assert.equal(d.added.length, 1);
});

test('land covered by a re-keyed record still counts as mapped', () => {
  const big = (pid: string) => feat({ PID: pid, NAME: 'Big' }, box(0, 0, 4, 4));
  const filler = Array.from({ length: 4 }, (_, i) => feat({ PID: `F${i}`, NAME: 'F' }, box(10 + i * 2, 0, 11 + i * 2, 1)));
  const a = fc(big('1'), feat({ PID: '2', NAME: 'Small' }, box(1, 1, 2, 2)), ...filler);
  const b = fc(big('1b'), ...filler);
  const d = diffLayer(a, b, src);
  assert.deepEqual(d.rekeyed.map((x) => x.to), ['1b']);
  assert.equal(d.removed[0].coverage.status, 'still_mapped');
});

test('churn on only one side is not a reload', () => {
  const a = fc(feat({ PID: '1', NAME: 'A' }), feat({ PID: '2', NAME: 'B' }, box(5, 5, 6, 6)));
  const b = fc(feat({ PID: '1', NAME: 'A' }));
  assert.equal(diffLayer(a, b, src).reload, undefined);
});
