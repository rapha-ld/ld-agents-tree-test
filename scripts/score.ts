/**
 * Print the scheme comparison from the command line.
 *
 *   pnpm score              all schemes, summary table
 *   pnpm score --scheme=id  add the per-scenario path breakdown for one scheme
 *   pnpm score --alpha=0.9  override the scan weight
 *   pnpm score --sweep      show how the ranking holds across a range of alpha
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildDestinationIndex } from '../src/parse/destinations';
import { parseScheme } from '../src/parse/scheme';
import { parseScenario } from '../src/parse/scenario';
import { DEFAULT_PARAMS, scoreScheme, type CostParams } from '../src/score/cost';

const root = process.cwd();
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const has = (name: string) => args.includes(`--${name}`);

const { index: destinations, extractedAt } = buildDestinationIndex(
  readFileSync(join(root, 'data/destinations.json'), 'utf8'),
  readFileSync(join(root, 'data/destinations.overlay.yaml'), 'utf8'),
);

const weights: Record<string, number> = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'data/weights.json'), 'utf8')) as Record<string, number>;
  } catch {
    return {};
  }
})();

const schemes = readdirSync(join(root, 'schemes'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => parseScheme(readFileSync(join(root, 'schemes', f), 'utf8'), f));

const scenarios = readdirSync(join(root, 'scenarios'))
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => parseScenario(readFileSync(join(root, 'scenarios', f), 'utf8'), f));

const params: CostParams = { ...DEFAULT_PARAMS, alpha: flag('alpha') ? Number(flag('alpha')) : DEFAULT_PARAMS.alpha };

const n = (v: number | null, digits = 2) => (v === null ? '  n/a' : v.toFixed(digits).padStart(6));
const pad = (s: string, w: number) => s.padEnd(w);

console.log(`destinations: ${destinations.size} (snapshot ${extractedAt})`);
console.log(`schemes:      ${schemes.length}`);
console.log(`scenarios:    ${scenarios.length}  (${scenarios.reduce((s, x) => s + x.tasks.length, 0)} tasks)`);
console.log(`alpha:        ${params.alpha}`);
console.log(
  Object.keys(weights).length === 0
    ? 'weights:      none, so traffic-weighted cost is omitted'
    : `weights:      ${Object.keys(weights).length} destinations`,
);
console.log('');

const results = schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, params));

const W = 26;
console.log(pad('metric', 30) + results.map((r) => pad(r.schemeId, W)).join(''));
console.log('-'.repeat(30 + W * results.length));
const row = (label: string, fn: (r: (typeof results)[number]) => string) =>
  console.log(pad(label, 30) + results.map((r) => pad(fn(r), W)).join(''));

row('scenario cost (weighted)', (r) => n(r.scenarioWeightedTotal, 1).trim());
row('mean cost per destination', (r) => n(r.meanCost).trim());
row('traffic-weighted mean', (r) => n(r.weightedMeanCost).trim());
row('worst case', (r) => (r.worstCase ? `${r.worstCase.cost.toFixed(2)} (${r.worstCase.destinationId})` : 'n/a'));
row('destinations placed', (r) => `${r.boundDestinations}`);
row('placements total', (r) => `${r.totalPlacements}`);
row('duplicated destinations', (r) => `${r.duplicated.length}`);
row('unreachable destinations', (r) => `${r.unreachable.length}`);
row('proposed (not in snapshot)', (r) => `${r.proposed.length}`);
row('top-level items', (r) => `${r.breadth[0]?.max ?? 0}`);
row('max siblings any level', (r) => `${Math.max(...r.breadth.map((b) => b.max))}`);

console.log('');
console.log('scenario cost by scheme (lower is better)');
console.log(pad('scenario', 30) + results.map((r) => pad(r.schemeId, W)).join(''));
console.log('-'.repeat(30 + W * results.length));
for (const scenario of scenarios) {
  const cells = results.map((r) => {
    const s = r.scenarios.find((x) => x.scenarioId === scenario.id);
    if (!s) return pad('missing', W);
    if (s.total === null) return pad(`unreachable (${s.unreachableTasks.length})`, W);
    return pad(s.total.toFixed(2), W);
  });
  console.log(pad(`${scenario.id} (w=${scenario.weight})`, 30) + cells.join(''));
}

for (const r of results) {
  if (r.proposed.length > 0) {
    console.log(`\n${r.schemeId}: proposed destinations not in the snapshot`);
    for (const id of r.proposed) console.log(`  ${id}`);
  }
}

const detail = flag('scheme');
if (detail) {
  const r = results.find((x) => x.schemeId === detail);
  if (!r) {
    console.error(`\nNo scheme with id "${detail}". Available: ${results.map((x) => x.schemeId).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n=== ${r.schemeName} (${r.schemeId}) shortest paths ===`);
  for (const s of r.scenarios) {
    console.log(`\n${s.scenarioId}  weight ${s.weight}  total ${n(s.total)}`);
    console.log(`  ${s.persona}`);
    for (const t of s.tasks) {
      if (t.cost === null) {
        console.log(`  [unreachable] ${t.prompt}  (targets: ${t.targets.join(', ')})`);
        continue;
      }
      console.log(`  ${t.cost.toFixed(2)}  ${t.clicks} clicks  ${t.prompt}`);
      console.log(`        ${t.labels?.join('  >  ')}`);
    }
  }
  if (r.duplicated.length > 0) {
    console.log(`\nduplicated destinations in ${r.schemeId}`);
    for (const d of r.duplicated) console.log(`  ${d.placements}x  ${d.destinationId}`);
  }
}

if (has('sweep')) {
  console.log('\nranking stability across alpha (scenario cost, weighted)');
  console.log(pad('alpha', 10) + results.map((r) => pad(r.schemeId, W)).join(''));
  console.log('-'.repeat(10 + W * results.length));
  for (const alpha of [0, 0.25, 0.5, 0.75, 1, 1.5, 2]) {
    const swept = schemes.map((s) => scoreScheme(s, destinations, scenarios, weights, { ...params, alpha }));
    const best = swept.reduce((a, b) =>
      (b.scenarioWeightedTotal ?? Infinity) < (a.scenarioWeightedTotal ?? Infinity) ? b : a,
    );
    console.log(
      pad(String(alpha), 10) +
        swept
          .map((r) => pad(`${n(r.scenarioWeightedTotal, 1).trim()}${r.schemeId === best.schemeId ? '  *' : ''}`, W))
          .join(''),
    );
  }
}
