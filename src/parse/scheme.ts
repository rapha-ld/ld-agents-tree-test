import { REVEAL_TYPES, type RevealType, type Scheme, type SchemeNode } from './types';
import { splitFrontmatter } from './frontmatter';

const SECTION_RE = /^#\s+(.*)$/;
const BULLET_RE = /^(\s*)-\s+(.*)$/;

function parseLabelPart(rest: string): { label: string; reveal: RevealType; destinationId: string | null } {
  const arrow = rest.indexOf('->');
  const left = arrow === -1 ? rest : rest.slice(0, arrow);
  const right = arrow === -1 ? '' : rest.slice(arrow + 2).trim();

  const modMatch = /\[([a-zA-Z]+)\]/.exec(left);
  let reveal: RevealType = 'visible';
  if (modMatch) {
    const candidate = modMatch[1].toLowerCase();
    if (!(REVEAL_TYPES as readonly string[]).includes(candidate)) {
      throw new Error(`Unknown reveal modifier [${modMatch[1]}]. Expected one of: ${REVEAL_TYPES.join(', ')}`);
    }
    reveal = candidate as RevealType;
  }

  const label = left.replace(/\[[a-zA-Z]+\]/, '').trim();
  return { label, reveal, destinationId: right === '' ? null : right };
}

export function parseScheme(src: string, filename = '<scheme>'): Scheme {
  const { data, body } = splitFrontmatter(src);
  const id = typeof data.id === 'string' ? data.id : undefined;
  const name = typeof data.name === 'string' ? data.name : undefined;
  if (!id) throw new Error(`${filename}: scheme frontmatter is missing \`id\``);
  if (!name) throw new Error(`${filename}: scheme frontmatter is missing \`name\``);

  const sections: SchemeNode[] = [];
  // stack[d] is the node currently open at depth d.
  const stack: SchemeNode[] = [];

  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('<!--')) continue;

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      const { label, reveal, destinationId } = parseLabelPart(sectionMatch[1]);
      const node: SchemeNode = { label, destinationId, reveal, isSection: true, depth: 0, children: [] };
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

    const { label, reveal, destinationId } = parseLabelPart(bulletMatch[2]);
    const node: SchemeNode = { label, destinationId, reveal, isSection: false, depth, children: [] };
    parent.children.push(node);
    stack.length = depth;
    stack[depth] = node;
  }

  if (sections.length === 0) throw new Error(`${filename}: scheme has no \`#\` sections`);

  return { id, name, ...(typeof data.notes === 'string' ? { notes: data.notes } : {}), sections };
}
