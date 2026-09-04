import { useMemo, useState } from 'react';
import { scenarios, schemes } from '../data';
import type { SchemeNode } from '../parse/types';

/**
 * Where the study is published. A link built from the dev server's own origin
 * would only work on this machine, which is exactly the mistake worth designing
 * out: the whole point of this screen is producing a link to send someone else.
 */
const PUBLISHED = 'https://launchdarkly-labs.github.io/ld-nav-lab/';

function countNodes(nodes: SchemeNode[]): { sections: number; items: number } {
  let items = 0;
  const walk = (list: SchemeNode[]) => {
    for (const node of list) {
      items += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return { sections: nodes.length, items };
}

export function Moderator() {
  const [base, setBase] = useState(PUBLISHED);
  const [copied, setCopied] = useState<string | null>(null);

  const taskCount = useMemo(() => scenarios.reduce((n, s) => n + s.tasks.length, 0), []);

  const linkFor = (id: string) => {
    const trimmed = base.trim().replace(/\?.*$/, '');
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}scheme=${encodeURIComponent(id)}`;
  };

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(id));
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard access can be refused. The link is on screen either way.
      setCopied(null);
    }
  };

  return (
    <div className="report">
      <h1>Send the study</h1>
      <p className="muted">
        Each participant sees one menu, decided by the link. Pick the menu, copy its link, send it. Their answers are
        filed against that menu, so a participant who gets the wrong link lands in the wrong arm of the study and there
        is no way to tell afterwards.
      </p>
      <p className="muted small">
        {schemes.length} menus &middot; {scenarios.length} scenarios &middot; {taskCount} tasks. Participants never see
        which menu they got, or that there are others.
      </p>

      <label className="field">
        Where the study is published
        <input value={base} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
        <span className="hint">
          Change this if you are testing against a different deployment. Use{' '}
          <button className="linklike" onClick={() => setBase(window.location.href.split('#')[0])}>
            this machine
          </button>{' '}
          for a link that only works here, which is fine when you are sitting beside the participant.
        </span>
      </label>

      <table className="detail">
        <thead>
          <tr>
            <th>Menu</th>
            <th>Top level</th>
            <th>Link to send</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {schemes.map((scheme) => {
            const { sections, items } = countNodes(scheme.sections);
            return (
              <tr key={scheme.id}>
                <td>
                  <strong>{scheme.name}</strong>
                  <div className="muted small">
                    <code>{scheme.id}</code>
                    {scheme.modes ? ` · ${scheme.modes.map((m) => m.label).join(' / ')} switcher` : ''}
                  </div>
                </td>
                <td className="muted small">
                  {sections} sections, {items} items
                </td>
                <td>
                  <code className="path">{linkFor(scheme.id)}</code>
                </td>
                <td>
                  <button className="small-btn" onClick={() => void copy(scheme.id)}>
                    {copied === scheme.id ? 'Copied' : 'Copy'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="muted small">
        A link with no <code>?scheme=</code> assigns a menu at random, and a link naming a menu that does not exist
        refuses to start rather than falling back to random. Both are deliberate: a typo in a link sent to twenty people
        is worth catching loudly.
      </p>
    </div>
  );
}
