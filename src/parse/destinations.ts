import yaml from 'js-yaml';
import type { Destination } from './types';

type Snapshot = {
  extractedAt?: string;
  counts?: Record<string, number>;
  destinations: Destination[];
};

/** Merge the generated route snapshot with the hand-curated non-route overlay. */
export function buildDestinationIndex(snapshotJson: string, overlayYaml: string) {
  const snapshot = JSON.parse(snapshotJson) as Snapshot;
  const overlayRaw = (yaml.load(overlayYaml) ?? []) as Array<Partial<Destination>>;

  const index = new Map<string, Destination>();
  for (const d of snapshot.destinations) {
    index.set(d.id, d);
  }

  for (const entry of overlayRaw) {
    if (!entry.id) throw new Error('Overlay entry is missing `id`');
    if (index.has(entry.id)) {
      throw new Error(`Overlay id "${entry.id}" collides with a generated destination`);
    }
    index.set(entry.id, {
      id: entry.id,
      label: entry.label ?? entry.id,
      routePattern: null,
      kind: entry.kind ?? 'drawer',
      owner: entry.owner ?? null,
      gated: entry.gated ?? false,
      source: 'overlay',
      ...(entry.reachableFrom ? { reachableFrom: entry.reachableFrom } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    });
  }

  return { index, extractedAt: snapshot.extractedAt ?? 'unknown', counts: snapshot.counts ?? {} };
}
