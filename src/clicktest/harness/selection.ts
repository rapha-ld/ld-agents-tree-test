// What a participant has picked as their answer, from the click that picked it. Any nav page,
// Home, Approvals, a Create menu item, a search result, a page's main button or one of the icons
// at the bottom of the nav counts. Section headers, the Create button itself and anything else
// that only opens or closes something don't.

import { CREATE_LANDING, CREATE_TYPES, ctaFor, DESTINATIONS } from '../nav/data';
import { FOOTER_LABEL, pageLabel, paletteLabel } from './trail';

export interface Selection {
  /** The track id of the click that made the pick, e.g. leaf:flags or cta:optimization. */
  trackId: string;
  /** The page the pick lands on, or the footer icon's id. Scoring checks this against the task's targets. */
  page: string;
  /** What the task card shows after "You selected". */
  label: string;
}

export function selectionFor(trackId: string): Selection | null {
  const [kind, ...rest] = trackId.split(':');
  const id = rest.join(':');
  const at = (page: string, label = pageLabel(page)) => (DESTINATIONS[page] ? { trackId, page, label } : null);

  if (kind === 'leaf') return at(id);
  if (kind === 'footer' && FOOTER_LABEL[id]) return { trackId, page: id, label: FOOTER_LABEL[id] };
  if (kind === 'pinned' && (id === 'home' || id === 'approvals')) return at(id);
  if (kind === 'cta') {
    const cta = ctaFor(id);
    return cta ? at(id, `${cta} on ${pageLabel(id)}`) : null;
  }
  if (kind === 'create') {
    const type = CREATE_TYPES.find((t) => t.id === id);
    const page = CREATE_LANDING[id];
    return type && page ? at(page, `${type.label} in the Create menu`) : null;
  }
  if (kind === 'palette') {
    if (id === 'action:create-flag' || id.startsWith('flag:')) return at('flags', `${paletteLabel(id)} in search`);
    if (id.startsWith('segment:')) return at('segments', `${paletteLabel(id)} in search`);
    return at(id);
  }
  return null;
}
