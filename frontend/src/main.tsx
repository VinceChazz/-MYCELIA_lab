import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
import './responsive.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<React.Fragment><App/></React.Fragment>);

// Production builds are installable and keep the shell, bundled demo and imagery offline.
// Vite dev intentionally skips the worker so hot-reload is never served from a stale cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {
    // The already loaded app continues working with IndexedDB even when registration is blocked.
  }); });
}
