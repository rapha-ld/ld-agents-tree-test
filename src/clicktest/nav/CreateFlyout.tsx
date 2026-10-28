// Create flyout. The tiles use LaunchPad icons for now; the review asked for a
// second pass with branded artwork per resource, which slots into `.tileIcon`.
//
// Built as a Menu (not a grid of Buttons) because picking a type is an action,
// and Menu gives arrow-key movement and typeahead for free. The grid is CSS
// only: arrow keys still walk the items in reading order.

import type { ReactNode } from 'react';
import { Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';

import type { CreateVariant } from './config';
import { useNav } from './config';
import { CREATE_LANDING, CREATE_TYPES } from './data';
import { SectionIcon } from './SectionIcon';

import { emit } from '../harness/tracker';

import styles from './CreateFlyout.module.css';

/**
 * Spot illustrations, one per type, named for its id (Figma: "Nav section icons
 * (scratch)", node 2:2; exported whole as SVG, then each viewBox framed to its
 * drawing's own bounds so they centre alike). For the `tiles-illustrated` variant.
 */
const ILLUSTRATIONS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./illustrations/*.svg', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.replace(/^\.\/illustrations\/|\.svg$/g, ''), url]),
);

/**
 * The spot tile's background, by product area. A best guess from the marketing
 * site's product tiles: CodeControl's pink-to-orange for feature management,
 * AgentControl's blue for agents; the rest are guesses from the brand palette
 * (CreateFlyout.module.css).
 */
const areaOf = (section: string) =>
  ({
    'Feature management': 'features',
    'Agent management': 'agents',
    Experimentation: 'experimentation',
    Measurement: 'experimentation',
    Audiences: 'audiences',
  })[section] ?? 'features';


interface CreateFlyoutProps {
  variant: CreateVariant;
  /** The pressable that opens the flyout (an IconButton in the pinned row or rail). */
  children: ReactNode;
}

export function CreateFlyout({ variant, children }: CreateFlyoutProps) {
  const { go } = useNav();
  const onAction = (key: React.Key) => {
    emit('click', `create:${String(key)}`, { region: 'create', via: 'action' });
    go(CREATE_LANDING[String(key)] ?? 'home');
  };
  // Both tile variants share the tile styles; `data-described` adds the line.
  const shape = variant.startsWith('tiles') ? 'tiles' : variant;
  // The illustrated tiles carry descriptions too.
  const described = variant === 'tiles-described' || variant === 'tiles-illustrated' || undefined;
  const illustrated = variant === 'tiles-illustrated' || undefined;

  return (
    <MenuTrigger>
      {children}
      <Popover
        placement="end top"
        offset={8}
        className={styles.popover}
        data-variant={shape}
        data-described={described}
        data-illustrated={illustrated}
      >
        <Menu
          aria-label="Create"
          onAction={onAction}
          className={styles.menu}
          data-variant={shape}
          data-described={described}
          data-illustrated={illustrated}
        >
          <MenuSection>
            <Header className={styles.header}>Create</Header>
            {CREATE_TYPES.map((t) => (
              <MenuItem key={t.id} id={t.id} textValue={t.label} className={styles.tile} data-track={`create:${t.id}`}>
                {illustrated ? (
                  // Centred in a 32px box on its product area's gradient, as
                  // the marketing site's product tiles are.
                  <span className={styles.spot} data-area={areaOf(t.section)} aria-hidden>
                    <img src={ILLUSTRATIONS[t.id]} alt="" className={styles.illustration} />
                  </span>
                ) : (
                  <span className={styles.tileIcon} aria-hidden>
                    <SectionIcon name={t.icon} size={variant === 'compact' ? 'medium' : 'small'} />
                  </span>
                )}
                <span className={styles.tileText}>
                  <span className={styles.tileLabel}>{t.label}</span>
                  {described && <span className={styles.tileDescription}>{t.description}</span>}
                </span>
                {shape === 'tiles' && <Icon name="arrow-brand-right" size="small" className={styles.arrow} aria-hidden />}
              </MenuItem>
            ))}
          </MenuSection>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
