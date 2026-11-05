import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = join(ROOT, 'data');
export const SNAPSHOTS = join(DATA, 'snapshots');
export const CHANGES = join(DATA, 'changes');
export const STATUS_FILE = join(DATA, 'status.json');

export type Feature = { type: 'Feature'; id?: number; geometry: unknown; properties: Record<string, unknown> };
export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

export type Status = {
  ok: boolean;
  last_attempt: string;
  last_success: string | null;
  last_snapshot: string | null;
  errors: string[];
};

// Snapshot folders are named by the Volusia (Eastern) calendar date, not UTC.
export function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

// One feature per line keeps git diffs readable and lets git dedupe unchanged days.
export async function writeFeatureCollection(path: string, fc: FeatureCollection) {
  const lines = fc.features.map((f) => JSON.stringify(f));
  await writeFile(path, `{"type":"FeatureCollection","features":[\n${lines.join(',\n')}\n]}\n`);
}

export async function listSnapshots(): Promise<string[]> {
  const entries = await readdir(SNAPSHOTS).catch(() => []);
  return entries.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
}
