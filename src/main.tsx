import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Self-Hosted Offline Fonts (Zero CDN dependency) */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/playfair-display/700.css';

/* Design System Tokens & Mobile-First Liquid Glass Shell */
import './styles/tokens.css';
import './styles/ambient.css';
import './styles/global.css';

import App from './App';
import { initPwaInstallCapture } from './services/pwaInstall';

initPwaInstallCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
