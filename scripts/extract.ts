/**
 * One-off extraction of a destination snapshot from a local gonfalon checkout.
 *
 * Never writes to gonfalon. Reads four source files and emits data/destinations.json.
 *
 *   node scripts/extract.ts [path-to-gonfalon]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const gonfalon = resolve(process.argv[2] ?? join(homedir(), 'code/launchdarkly/gonfalon'));

const SOURCES = {
  ownership: 'static/ld/routes/appRouteOwnership.ts',
  navigators: 'packages/navigator/src/navigators.ts',
  navSections: 'packages/chrome/src/internal/useNavigationSections.ts',
};

function read(rel: string) {
  try {
    return readFileSync(join(gonfalon, rel), 'utf8');
  } catch {
    throw new Error(`Could not read ${rel} under ${gonfalon}. Pass the gonfalon path as argv[1].`);
  }
}

/** Irregular plurals we care about, checked before the generic rules. */
const SINGULARS: Record<string, string> = {
  'ai-configs': 'ai-config',
  'release-policies': 'release-policy',
  'context-kinds': 'context-kind',
  'model-configs': 'model-config',
  'prompt-snippets': 'prompt-snippet',
  'judgeTemplates': 'judge-template',
  'data-sources': 'data-source',
  'guarded-rollouts': 'guarded-rollout',
  'observability-metrics': 'observability-metric',
  'metric-groups': 'metric-group',
  'access-tokens': 'access-token',
  'api-keys': 'api-key',
};

function singularize(word: string) {
  if (SINGULARS[word]) return SINGULARS[word];
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses') || word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const ACRONYMS = new Set(['sdk', 'ai', 'api', 'pdf', 'url', 'cli', 'rbac', 'oauth', 'saml', 'scim', 'id', 'ui', 'crd']);

function humanize(token: string) {
  const words = token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim()
    .split(/\s+/);
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(' ');
}

/**
 * Turn a React Router pattern into a stable dotted destination id.
 *
 * A `:param` segment instantiates the collection before it, so
 * `flags/:flagKey/targeting` becomes `flag.targeting` rather than
 * `flags.flagKey.targeting`.
 */
function patternToTokens(pattern: string) {
  const raw = pattern.replace(/\/\*$/, '').replace(/^\/+|\/+$/g, '');
  const segments = raw.split('/').filter(Boolean);
  const tokens: string[] = [];
  let prevWasParam = false;

  for (const seg of segments) {
    if (seg === '*') continue;

    if (seg.startsWith(':')) {
      const paramName = seg.slice(1).replace(/\?$/, '').replace(/Key$|Id$/, '');
      const prev = tokens[tokens.length - 1];

      if (prevWasParam || !prev) {
        // Consecutive params describe a nested entity, so the param names it.
        tokens.push(paramName);
      } else {
        const singular = singularize(prev);
        if (singular === prev) {
          // The collection token was already singular, so the param opens a detail view.
          tokens.push('detail');
        } else {
          tokens[tokens.length - 1] = singular;
        }
      }
      prevWasParam = true;
      continue;
    }

    tokens.push(seg);
    prevWasParam = false;
  }

  // Account settings live at /settings/* and would otherwise collide with a
  // project's own settings tree, so they get an explicit scope prefix.
  if (tokens[0] === 'settings' && !pattern.startsWith('/projects/')) {
    tokens.shift();
    return ['account', ...tokens];
  }

  // Project scope is implicit for every project-scoped route.
  if (tokens[0] === 'project' || tokens[0] === 'projects') {
    tokens.shift();
    if (tokens.length === 0) return ['project', 'home'];
  }
  return tokens;
}

function tokensToId(tokens: string[]) {
  if (tokens.length === 0) return 'home';
  return tokens.map((t) => t.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()).join('.');
}

function tokensToLabel(tokens: string[]) {
  if (tokens.length === 0) return 'Home';
  const last = tokens[tokens.length - 1];
  if (last === 'detail' && tokens.length > 1) {
    return `${humanize(tokens[tokens.length - 2])} detail`;
  }
  if (tokens.length === 1 && last === 'account') return 'Account settings';
  return humanize(last);
}

// ---------------------------------------------------------------------------
// appRouteOwnership.ts -> the authoritative route list
// ---------------------------------------------------------------------------
function parseOwnership(src: string) {
  const out: Array<{ pattern: string; owner: string }> = [];
  const re = /'((?:\/|\*)[^']*)':\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({ pattern: m[1], owner: m[2] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// navigators.ts -> canonical builder name per route pattern
// ---------------------------------------------------------------------------
function parseNavigators(src: string) {
  const byPattern = new Map<string, string>();
  const byName = new Map<string, string>();
  const fnRe = /export function (to[A-Za-z0-9_]+)\s*\(/g;
  const marks: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src)) !== null) {
    marks.push({ name: m[1], start: m.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].start, marks[i + 1]?.start ?? src.length);
    const route = /appRoute\('([^']+)'/.exec(body);
    if (!route) continue;
    byName.set(marks[i].name, route[1]);
    if (!byPattern.has(route[1])) byPattern.set(route[1], marks[i].name);
  }
  return { byPattern, byName };
}

// ---------------------------------------------------------------------------
// useNavigationSections.ts -> today's nav items, labels, and gating
// ---------------------------------------------------------------------------
function parseNavItems(src: string) {
  const items: Array<{ key: string; label: string; icon: string; navigator?: string; gated: boolean }> = [];
  const re = /const\s+(\w+):\s*NavItem\s*=\s*\{([\s\S]*?)\n    \};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const body = m[2];
    const label = /label:\s*'([^']+)'/.exec(body)?.[1];
    const key = /key:\s*'([^']+)'/.exec(body)?.[1] ?? m[1];
    const icon = /icon:\s*'([^']+)'/.exec(body)?.[1] ?? '';
    const navigator = /to:[\s\S]*?\b(to[A-Z]\w+)\(/.exec(body)?.[1];
    if (!label) continue;
    items.push({ key, label, icon, navigator, gated: /\bhidden:/.test(body) });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const ownershipSrc = read(SOURCES.ownership);
const navigatorsSrc = read(SOURCES.navigators);
const navSectionsSrc = read(SOURCES.navSections);

const routes = parseOwnership(ownershipSrc);
const navigators = parseNavigators(navigatorsSrc);
const navItems = parseNavItems(navSectionsSrc);

// Destinations reachable from a gated top-level nav item inherit that gating.
const gatedNavigators = new Set(navItems.filter((i) => i.gated && i.navigator).map((i) => i.navigator!));
const gatedPatternPrefixes = [...gatedNavigators]
  .map((n) => navigators.byName.get(n))
  .filter((p): p is string => Boolean(p));

// Labels authored by the product team beat labels derived from a URL segment.
const navLabelByPattern = new Map<string, string>();
for (const item of navItems) {
  const pattern = item.navigator ? navigators.byName.get(item.navigator) : undefined;
  if (pattern) navLabelByPattern.set(pattern, item.label);
}

type Destination = {
  id: string;
  label: string;
  routePattern: string | null;
  kind: string;
  owner: string | null;
  gated: boolean;
  source: 'generated' | 'overlay';
  navigator?: string;
};

const seen = new Map<string, Destination>();
const collisions: string[] = [];

for (const { pattern, owner } of routes) {
  // Catch-all patterns are not destinations.
  if (pattern === '/*' || pattern === '*') continue;

  const tokens = patternToTokens(pattern);
  let id = tokensToId(tokens);
  const label = navLabelByPattern.get(pattern) ?? tokensToLabel(tokens);
  const navigator = navigators.byPattern.get(pattern);
  const gated = gatedPatternPrefixes.some((p) => pattern === p || pattern.startsWith(`${p}/`));

  if (seen.has(id)) {
    const existing = seen.get(id)!;
    // A wildcard or shorter pattern loses to the more specific one already recorded.
    if (existing.routePattern && existing.routePattern.length <= pattern.length) {
      collisions.push(`${id}: kept ${existing.routePattern}, dropped ${pattern}`);
      continue;
    }
    collisions.push(`${id}: replaced ${existing.routePattern} with ${pattern}`);
    id = `${id}`;
  }

  seen.set(id, {
    id,
    label,
    routePattern: pattern,
    kind: 'route',
    owner,
    gated,
    source: 'generated',
    ...(navigator ? { navigator } : {}),
  });
}

const destinations = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));

const outPath = join(process.cwd(), 'data/destinations.json');
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      extractedAt: new Date().toISOString().slice(0, 10),
      counts: {
        routePatterns: routes.length,
        destinations: destinations.length,
        gated: destinations.filter((d) => d.gated).length,
        collisionsResolved: collisions.length,
      },
      destinations,
    },
    null,
    2,
  )}\n`,
);

const navOut = join(process.cwd(), 'data/current-nav-items.json');
writeFileSync(navOut, `${JSON.stringify(navItems, null, 2)}\n`);

console.log(`gonfalon:        ${gonfalon}`);
console.log(`route patterns:  ${routes.length}`);
console.log(`destinations:    ${destinations.length}`);
console.log(`gated:           ${destinations.filter((d) => d.gated).length}`);
console.log(`nav items:       ${navItems.length}`);
console.log(`collisions:      ${collisions.length}`);
for (const c of collisions.slice(0, 20)) console.log(`  ${c}`);
console.log(`\nwrote ${outPath}`);
console.log(`wrote ${navOut}`);
