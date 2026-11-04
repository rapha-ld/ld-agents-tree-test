import { useState } from 'react';
import { schemes } from '../data';
import { persistenceMode } from '../session';
import type { SchemeNode } from '../parse/types';

/** Where the study is published, offered as an alternative to this machine. */
const PUBLISHED = 'https://rapha-ld.github.io/ld-agents-tree-test/';

/** This dev server, which is what a link should point at while you are testing. */
function here() {
  return window.location.href.split('#')[0].split('?')[0];
}

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
  const [base, setBase] = useState(here);
  const [copied, setCopied] = useState<string | null>(null);

  const linkFor = (id: string) => {
    const trimmed = base.trim().replace(/[?#].*$/, '');
    return `${trimmed}?scheme=${encodeURIComponent(id)}`;
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

  const isPublished = base.trim().replace(/[?#].*$/, '') === PUBLISHED;

  return (
    <div className="report">
      <h1>Send the study</h1>

      <label className="field">
        Link points at
        <input value={base} onChange={(e) => setBase(e.target.value)} spellCheck={false} />
        <span className="hint">
          <button className="linklike" onClick={() => setBase(here())}>
            This machine
          </button>{' '}
          &middot;{' '}
          <button className="linklike" onClick={() => setBase(PUBLISHED)}>
            Published site
          </button>
        </span>
      </label>

      {isPublished ? (
        <p className="warn">
          The published site only has the menus that were on <code>main</code> when it last deployed. If a link there
          says the menu does not exist, push to <code>main</code> and wait for the Pages deploy.
        </p>
      ) : null}

      {persistenceMode === 'local' ? (
        <p className="warn">
          Database not connected here, so runs taken through these links stay in the participant&rsquo;s own browser.
        </p>
      ) : null}

      <table className="detail">
        <thead>
          <tr>
            <th>Menu</th>
            <th>Top level</th>
            <th>Link</th>
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
    </div>
  );
}
