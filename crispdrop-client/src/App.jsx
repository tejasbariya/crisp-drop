/**
 * App.jsx — Root application router and layout
 *
 * Wraps all pages in the SocketProvider (WebRTC + signaling context)
 * and renders the global OfflineBanner.
 *
 * Routes:
 *   / → Home (landing)
 *   /lobby → RoomLobby (create/join)
 *   /transfer → TransferScreen (active transfer)
 *   * → redirect to /
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider, useSocket } from './context/SocketContext';
import { OfflineBanner } from './components/OfflineBanner';
import { Home } from './pages/Home';
import { RoomLobby } from './pages/RoomLobby';
import { TransferScreen } from './pages/TransferScreen';

// ── Service Worker Update Detector ───────────────────────────────────────────

function UpdateDetector({ children }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Listen for the custom event dispatched from main.jsx when SW update is waiting
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw-update-available', handleUpdate);
    return () => window.removeEventListener('sw-update-available', handleUpdate);
  }, []);

  const handleUpdate = () => {
    // Tell the waiting SW to skip waiting and activate
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      });
    }
    window.location.reload();
  };

  return (
    <>
      {updateAvailable && (
        <div
          id="update-banner"
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-[9998] animate-slide-in-down"
        >
          <div className="bg-indigo-600 text-white px-4 py-2.5 flex items-center justify-center gap-4 text-sm font-medium">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
              </svg>
              <span>New version available</span>
            </div>
            <button
              id="update-banner-refresh"
              onClick={handleUpdate}
              className="px-3 py-1 bg-white text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors"
            >
              Refresh
            </button>
            <button
              id="update-banner-dismiss"
              onClick={() => setUpdateAvailable(false)}
              className="ml-2 text-indigo-200 hover:text-white text-xs underline"
            >
              Later
            </button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}

// ── Global Banner Wrapper (needs Socket context) ──────────────────────────────

function GlobalBanners() {
  const { isOnline, isConnected } = useSocket();
  return <OfflineBanner isOnline={isOnline} isConnected={isConnected} />;
}

// ── App Root ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <UpdateDetector>
        <SocketProvider>
          <GlobalBanners />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/lobby" element={<RoomLobby />} />
            <Route path="/transfer" element={<TransferScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SocketProvider>
      </UpdateDetector>
    </BrowserRouter>
  );
}
