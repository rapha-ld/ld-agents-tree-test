// The command palette the sidebar search field opens. Two presentations share
// one body:
//
// - `PaletteModal`: centred modal over a dimmed page (today's palette, reached
//   from a field instead of a nav row).
// - `PalettePopover`: anchored to the field and offset up by the field's own
//   height, so the palette's input lands exactly on top of the field — the
//   field "becomes" the input and results drop from it. Sruthy's option 1A.
// - `InlineSearch`: the field is itself a text input, and the same results
//   drop below it as an autocomplete while focus stays in the field (#161).

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import {
  Autocomplete,
  Dialog,
  Group,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  Popover,
  SearchField,
} from '@launchpad-ui/components';
import { Icon } from '@launchpad-ui/icons';

import { useNav } from './config';
import { DESTINATIONS, FLAGS, SECTIONS, SEGMENTS, STARRED, STARRED_ICONS } from './data';
import type { SectionIconName } from './SectionIcon';
import { SectionIcon } from './SectionIcon';

import { currentQuery, emit } from '../harness/tracker';

import styles from './CommandPalette.module.css';

/* Case-insensitive substring match; see gcomstock/factory-settings/SearchableAddMenu
   for why this isn't react-aria's `useFilter`. */
const contains = (textValue: string, inputValue: string) => textValue.toLowerCase().includes(inputValue.toLowerCase());

const PAGES: Array<{ id: string; label: string; icon: SectionIconName; section?: string }> = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'approvals', label: 'Approvals', icon: 'inbox-outline' },
  ...STARRED.map((s) => ({ id: s.id, label: s.label, icon: STARRED_ICONS.icon, section: 'Shortcuts' })),
  ...SECTIONS.flatMap((s) => s.leaves.map((l) => ({ id: l.id, label: l.label, icon: s.icon, section: s.label }))),
];

/** The palette's results, filtered by the surrounding Autocomplete's input. */
function PaletteResults({ onClose }: { onClose: () => void }) {
  const { go } = useNav();

  const onAction = (key: React.Key) => {
    const id = String(key);
    const query = currentQuery();
    emit('click', `palette:${id}`, { region: 'palette', via: 'action', ...(query ? { query } : {}) });
    // Objects open their list page — the mock app has no detail pages.
    if (id.startsWith('flag:')) go('flags');
    else if (id.startsWith('segment:')) go('segments');
    else if (id.startsWith('action:')) go(id === 'action:create-flag' ? 'flags' : 'home');
    else if (DESTINATIONS[id]) go(id);
    onClose();
  };

  return (
    <Menu
      aria-label="Results"
      className={styles.menu}
      onAction={onAction}
      renderEmptyState={() => (
        <p className={styles.empty}>No pages or flags match your search. Try a different keyword.</p>
      )}
    >
      <MenuSection>
        <Header>Pages</Header>
        {PAGES.map((p) => (
          <MenuItem
            key={p.id}
            id={p.id}
            textValue={p.section ? `${p.label} ${p.section}` : p.label}
            data-track={`palette:${p.id}`}
          >
            <SectionIcon name={p.icon} size="small" />
            <span className={styles.itemLabel}>{p.label}</span>
            {p.section && <span className={styles.itemMeta}>{p.section}</span>}
          </MenuItem>
        ))}
      </MenuSection>
      <MenuSection>
        <Header>Flags</Header>
        {FLAGS.map((f) => (
          <MenuItem key={f} id={`flag:${f}`} textValue={f} data-track={`palette:flag:${f}`}>
            <Icon name="flag" size="small" />
            <span className={styles.itemLabel}>{f}</span>
            <span className={styles.itemMeta}>Flag</span>
          </MenuItem>
        ))}
      </MenuSection>
      <MenuSection>
        <Header>Segments</Header>
        {SEGMENTS.map((s) => (
          <MenuItem key={s} id={`segment:${s}`} textValue={s} data-track={`palette:segment:${s}`}>
            <Icon name="group" size="small" />
            <span className={styles.itemLabel}>{s}</span>
            <span className={styles.itemMeta}>Segment</span>
          </MenuItem>
        ))}
      </MenuSection>
      <MenuSection>
        <Header>Actions</Header>
        <MenuItem id="action:create-flag" textValue="Create flag" data-track="palette:action:create-flag">
          <Icon name="add" size="small" />
          <span className={styles.itemLabel}>Create flag</span>
        </MenuItem>
        <MenuItem id="action:invite" textValue="Invite a member" data-track="palette:action:invite">
          <Icon name="person-add" size="small" />
          <span className={styles.itemLabel}>Invite a member</span>
        </MenuItem>
        <MenuItem id="action:settings" textValue="Open settings" data-track="palette:action:settings">
          <Icon name="gear" size="small" />
          <span className={styles.itemLabel}>Open settings</span>
        </MenuItem>
      </MenuSection>
    </Menu>
  );
}

function PaletteFooter() {
  return (
    <footer className={styles.footer}>
      <span>↑↓ Move</span>
      <span>↵ Open</span>
      <span>Esc Close</span>
    </footer>
  );
}

/**
 * `header`: the input reads as the palette's header row (the modal).
 * `field`: a regular bordered search field with LaunchPad's focus ring, for the
 * palette that opens from the sidebar field and takes its place.
 */
function PaletteBody({ onClose, input = 'header' }: { onClose: () => void; input?: 'header' | 'field' }) {
  return (
    <Autocomplete filter={contains}>
      <SearchField aria-label="Search or jump to" autoFocus className={styles.search} data-input={input}>
        <Group className={styles.searchGroup}>
          <Icon name="search" size="small" />
          <Input placeholder="Search or jump to" />
          <kbd className={styles.kbd}>esc</kbd>
        </Group>
      </SearchField>
      <PaletteResults onClose={onClose} />
      <PaletteFooter />
    </Autocomplete>
  );
}

interface PaletteProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function PaletteModal({ isOpen, onOpenChange }: PaletteProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={styles.overlay}>
      <Modal className={styles.modal}>
        <Dialog aria-label="Command palette" className={styles.dialog}>
          <PaletteBody onClose={() => onOpenChange(false)} />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** The padding around the anchored palette's input (--lp-spacing-300), in px. */
function paletteInset() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--lp-spacing-300');
  return (
    parseFloat(value) *
      (value.trim().endsWith('rem') ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1) || 0
  );
}

export function PalettePopover({
  isOpen,
  onOpenChange,
  triggerRef,
}: PaletteProps & { triggerRef: RefObject<HTMLElement | null> }) {
  // Lift the popover by the field's height, plus the padding around its own
  // bordered input, and pull it left by that padding, so the palette's input
  // lands exactly on the field. Measured rather than hardcoded so it follows
  // the field's and the padding's token-driven sizes.
  const fieldHeight = triggerRef.current?.offsetHeight ?? 0;
  const fieldWidth = triggerRef.current?.offsetWidth ?? 0;
  // The input's padding, plus the popover's own 1px border.
  const inset = paletteInset() + 1;
  // The box the opening animation starts from: the field, with the padding
  // around the palette's input (CommandPalette.module.css, paletteExpand).
  const from = {
    '--from-w': `${fieldWidth + 2 * inset}px`,
    '--from-h': `${fieldHeight + 2 * inset}px`,
  } as CSSProperties;
  return (
    <Popover
      triggerRef={triggerRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="bottom start"
      offset={-(fieldHeight + inset)}
      crossOffset={-inset}
      // The field sits near the window's left edge; let the popover come
      // closer than the default 12px so it can line up.
      containerPadding={4}
      className={styles.popover}
      data-expand
      style={from}
    >
      <Dialog aria-label="Command palette" className={styles.dialog}>
        <PaletteBody onClose={() => onOpenChange(false)} input="field" />
      </Dialog>
    </Popover>
  );
}

/**
 * The sidebar's search as a real text input (search: 'input'). Focusing it,
 * typing, or ⌘K drops the palette's results below it; arrow keys move through
 * them while focus stays in the field; Enter opens one; Escape or leaving the
 * field puts them away.
 */
export function InlineSearch({ isOpen, onOpenChange }: PaletteProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const [value, setValue] = useState('');

  // ⌘K (NavShell) opens the palette; here that means focusing the field.
  useEffect(() => {
    if (isOpen && document.activeElement !== inputRef.current) inputRef.current?.focus();
  }, [isOpen]);

  const close = () => {
    onOpenChange(false);
    setValue('');
  };

  return (
    <Autocomplete
      filter={contains}
      inputValue={value}
      onInputChange={(next) => {
        setValue(next);
        onOpenChange(true);
      }}
    >
      <SearchField
        aria-label="Search or jump to"
        className={styles.inlineField}
        onFocus={() => onOpenChange(true)}
        onBlur={(e) => {
          // Into the results (a click on one) isn't leaving.
          if (popoverRef.current?.contains(e.relatedTarget as Node)) return;
          close();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          close();
          inputRef.current?.blur();
        }}
      >
        <Group ref={fieldRef} className={styles.inlineGroup} data-marker="search" data-drawer-target="search">
          <Icon name="search" size="small" variant="subtle" />
          <Input ref={inputRef} placeholder="Search or jump to" />
          <kbd className={styles.kbd}>⌘K</kbd>
        </Group>
      </SearchField>
      <Popover
        ref={popoverRef}
        triggerRef={fieldRef}
        isOpen={isOpen}
        onOpenChange={(open) => (open ? onOpenChange(true) : close())}
        isNonModal
        placement="bottom start"
        offset={4}
        className={styles.inlinePopover}
      >
        <PaletteResults
          onClose={() => {
            close();
            inputRef.current?.blur();
          }}
        />
        <PaletteFooter />
      </Popover>
    </Autocomplete>
  );
}
