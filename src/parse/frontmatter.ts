import yaml from 'js-yaml';

export function splitFrontmatter(src: string): { data: Record<string, unknown>; body: string } {
  const normalized = src.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { data: {}, body: normalized };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { data: {}, body: normalized };
  }
  const raw = normalized.slice(4, end);
  const body = normalized.slice(end + 4).replace(/^\n/, '');
  const data = (yaml.load(raw) ?? {}) as Record<string, unknown>;
  return { data, body };
}
