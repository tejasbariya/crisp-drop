/**
 * main.jsx — Application Entry Point
 *
 * Responsibilities:
 *   1. Mount the React app to #root
 *   2. Register the Workbox-generated service worker manually
 *      (injectRegister: null in vite.config.js gives us full control)
 *   3. Fire a custom 'sw-update-available' event when a new SW is waiting,
 *      so App.jsx can show the non-intrusive update banner
 *   4. Handle the controller change (post-skip-waiting reload)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './assets/index.css';

// ── React Rendering ───────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service Worker Registration ────────────────────────────────────────────────

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Use workbox-window for a cleaner lifecycle management API
  import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/sw.js');

    // When a new SW installs and is waiting (update scenario):
    wb.addEventListener('waiting', () => {
      console.log('[SW] New service worker waiting — dispatching update event');
      // Dispatch custom event so App.jsx can show the update banner
      window.dispatchEvent(new CustomEvent('sw-update-available'));
    });

    // When the SW takes control (after skip_waiting / first install):
    wb.addEventListener('controlling', () => {
      console.log('[SW] Service worker now controlling — reloading for fresh cache');
      // Only reload if triggered by an update (not first install)
      if (wb._compatibleControllingSW) {
        window.location.reload();
      }
    });

    // Log successful registration for debugging
    wb.addEventListener('activated', (event) => {
      if (!event.isUpdate) {
        console.log('[SW] Service worker activated for the first time');
      }
    });

    // Register the service worker
    wb.register().catch((err) => {
      console.error('[SW] Registration failed:', err);
    });
  });
}
