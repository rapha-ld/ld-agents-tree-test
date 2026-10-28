// Entry for clicktest.html, the unmoderated click test. Kept apart from the tree
// test (index.html, src/main.tsx) so neither bundle carries the other.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import iconSprite from '@launchpad-ui/icons/sprite.svg?raw';

import '@launchpad-ui/tokens/index.css';
import '@launchpad-ui/tokens/themes.css';
import '@launchpad-ui/tokens/fonts.css';
import '@launchpad-ui/components/styles/base.css';
import '@launchpad-ui/components/styles/themes.css';
import '@launchpad-ui/components/style.css';
import '@launchpad-ui/icons/style.css';
import './shared/global.css';
import './nav/button-experiments.css';
import './nav/opticalSize.css';

import { ClickTest } from './ClickTest';

// LaunchPad icons are <use href="#lp-icon-*"> references into this sprite.
const spriteHost = document.createElement('div');
spriteHost.style.display = 'none';
spriteHost.innerHTML = iconSprite;
document.body.insertBefore(spriteHost, document.body.firstChild);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <ClickTest />
  </StrictMode>,
);
