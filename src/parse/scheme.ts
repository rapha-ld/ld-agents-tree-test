import { REVEAL_TYPES, type RevealType, type Scheme, type SchemeMode, type SchemeNode } from './types';
import { splitFrontmatter } from './frontmatter';

const SECTION_RE = /^#\s+(.*)$/;
const BULLET_RE = /^(\s*)-\s+(.*)$/;

type LabelPart = { label: string; reveal: RevealType; mode: string | null; destinationId: string | null };

/**
 * Parses `Label [collapsed] [mode=code] -> destination.id`. Bracket groups may
 * appear in any order and any number; `mode=` names a switcher mode, anything
 * else is a reveal type.
 */
function parseLabelPart(rest: string, modeIds: Set<string>): LabelPart {
  const arrow = rest.indexOf('->');
  const left = arrow === -1 ? rest : rest.slice(0, arrow);
  const right = arrow === -1 ? '' : rest.slice(arrow + 2).trim();

  let reveal: RevealType = 'visible';
  let mode: string | null = null;

  for (const match of left.matchAll(/\[([a-zA-Z]+)(?:=([a-zA-Z0-9_-]+))?\]/g)) {
    const name = match[1].toLowerCase();
    if (name === 'mode') {
      const value = match[2];
      if (!value) throw new Error('[mode] needs a value, for example [mode=code]');
      if (!modeIds.has(value)) {
        throw new Error(`Unknown mode "${value}". Declare it under \`modes\` in the frontmatter.`);
      }
      mode = value;
      continue;
    }
    if (!(REVEAL_TYPES as readonly string[]).includes(name)) {
      throw new Error(`Unknown reveal modifier [${match[1]}]. Expected one of: ${REVEAL_TYPES.join(', ')}, or mode=`);
    }
    reveal = name as RevealType;
  }

  const label = left.replace(/\[[a-zA-Z]+(?:=[a-zA-Z0-9_-]+)?\]/g, '').trim();
  return { label, reveal, mode, destinationId: right === '' ? null : right };
}

function parseModes(raw: unknown, filename: string): SchemeMode[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error(`${filename}: \`modes\` must be a list`);
  const modes = raw.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`${filename}: modes[${i}] must have an id and a label`);
    }
    const { id, label } = entry as { id?: unknown; label?: unknown };
    if (typeof id !== 'string' || typeof label !== 'string') {
      throw new Error(`${filename}: modes[${i}] must have a string id and label`);
    }
    return { id, label };
  });
  if (modes.length < 2) throw new Error(`${filename}: a mode switcher needs at least two modes`);
  return modes;
}

export function parseScheme(src: string, filename = '<scheme>'): Scheme {
  const { data, body } = splitFrontmatter(src);
  const id = typeof data.id === 'string' ? data.id : undefined;
  const name = typeof data.name === 'string' ? data.name : undefined;
  if (!id) throw new Error(`${filename}: scheme frontmatter is missing \`id\``);
  if (!name) throw new Error(`${filename}: scheme frontmatter is missing \`name\``);

  const modes = parseModes(data.modes, filename);
  const modeIds = new Set(modes?.map((m) => m.id) ?? []);

  const sections: SchemeNode[] = [];
  // stack[d] is the node currently open at depth d.
  const stack: SchemeNode[] = [];

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('<!--')) continue;

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      const { label, reveal, mode, destinationId } = parseLabelPart(sectionMatch[1], modeIds);
      const node: SchemeNode = { label, destinationId, reveal, mode, isSection: true, depth: 0, children: [] };
      sections.push(node);
      stack.length = 0;
      stack[0] = node;
      continue;
    }

    const bulletMatch = BULLET_RE.exec(line);
    if (!bulletMatch) {
      throw new Error(`${filename}:${i + 1}: expected a \`#\` section or a \`-\` bullet, got: ${line}`);
    }

    const indent = bulletMatch[1].length;
    if (indent % 2 !== 0) {
      throw new Error(`${filename}:${i + 1}: indentation must be a multiple of two spaces`);
    }
    const depth = indent / 2 + 1;
    const parent = stack[depth - 1];
    if (!parent) {
      throw new Error(`${filename}:${i + 1}: bullet is indented past its parent`);
    }

    const { label, reveal, mode, destinationId } = parseLabelPart(bulletMatch[2], modeIds);
    const sectionMode = sections[sections.length - 1]?.mode ?? null;
    if (mode !== null && sectionMode !== null && mode !== sectionMode) {
      throw new Error(
        `${filename}:${i + 1}: "${label}" is [mode=${mode}] inside a [mode=${sectionMode}] section, so it can never be seen`,
      );
    }
    const node: SchemeNode = { label, destinationId, reveal, mode, isSection: false, depth, children: [] };
    parent.children.push(node);
    stack.length = depth;
    stack[depth] = node;
  }

  if (sections.length === 0) throw new Error(`${filename}: scheme has no \`#\` sections`);

  if (modes) {
    const used = new Set<string>();
    const collectModes = (node: SchemeNode) => {
      if (node.mode !== null) used.add(node.mode);
      for (const child of node.children) collectModes(child);
    };
    for (const section of sections) collectModes(section);
    const unused = modes.filter((m) => !used.has(m.id));
    if (unused.length > 0) {
      throw new Error(`${filename}: mode(s) ${unused.map((m) => m.id).join(', ')} have no sections`);
    }
  }

  return {
    id,
    name,
    ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
    ...(modes ? { modes } : {}),
    sections,
  };
}
