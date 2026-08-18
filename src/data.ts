import destinationsJson from '../data/destinations.json?raw';
import overlayYaml from '../data/destinations.overlay.yaml?raw';
import weightsJson from '../data/weights.json?raw';
import { buildDestinationIndex } from './parse/destinations';
import { parseScheme } from './parse/scheme';
import { parseScenario } from './parse/scenario';
import type { Scenario, Scheme } from './parse/types';

const schemeFiles = import.meta.glob('../schemes/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const scenarioFiles = import.meta.glob('../scenarios/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const { index, extractedAt } = buildDestinationIndex(destinationsJson, overlayYaml);

export const destinations = index;
export const snapshotDate = extractedAt;
export const weights = JSON.parse(weightsJson) as Record<string, number>;

export const schemes: Scheme[] = Object.entries(schemeFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src]) => parseScheme(src, path));

export const scenarios: Scenario[] = Object.entries(scenarioFiles)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src]) => parseScenario(src, path));
