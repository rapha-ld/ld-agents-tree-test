// A section icon from either source: LaunchPad's sprite, or the local paths
// in localIcons.ts for icons LaunchPad doesn't have yet. Both render through
// LaunchPad's own <Icon>, which draws its children inside its <svg> — so local
// icons get the same size and `variant` fill classes, and the same
// `data-icon` hook, as sprite ones. Callers don't need to know which is which.

import type { ComponentProps } from 'react';
import { Icon } from '@launchpad-ui/icons';
import type { IconProps } from '@launchpad-ui/icons';

import type { LocalIconName } from './localIcons';
import { LOCAL_ICONS } from './localIcons';

export type SectionIconName = NonNullable<IconProps['name']> | LocalIconName;

const isLocal = (name: SectionIconName): name is LocalIconName => name in LOCAL_ICONS;

type SectionIconProps = Omit<ComponentProps<typeof Icon>, 'name' | 'children'> & {
  name: SectionIconName;
};

export function SectionIcon({ name, ...props }: SectionIconProps) {
  if (!isLocal(name)) return <Icon name={name} {...props} />;

  return (
    // Local paths are drawn on LaunchPad's 20px grid.
    <Icon viewBox="0 0 20 20" data-icon={name} {...props}>
      {LOCAL_ICONS[name].map((p, i) => (
        <path key={i} d={p.d} fillRule={p.evenOdd ? 'evenodd' : undefined} clipRule={p.evenOdd ? 'evenodd' : undefined} />
      ))}
    </Icon>
  );
}
