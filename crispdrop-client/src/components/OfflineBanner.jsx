/**
 * components/OfflineBanner.jsx
 *
 * Displays a non-intrusive banner when:
 *   1. The browser is offline (navigator.onLine = false)
 *   2. The Socket.io connection is lost (signaling unreachable)
 *
 * Also shows a "New version available" banner when the service worker
 * detects an update waiting (passed in via `updateAvailable` prop).
 */

import React from 'react';

export function OfflineBanner({ isOnline, isConnected, updateAvailable, onUpdate }) {
  // ── New version available ─────────────────────────────────────────────────
  if (updateAvailable) {
    return (
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
            onClick={onUpdate}
            className="px-3 py-1 bg-white text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // ── Offline / disconnected ────────────────────────────────────────────────
  const isOffline = !isOnline;
  const isSignalingDown = isOnline && !isConnected;

  if (!isOffline && !isSignalingDown) return null;

  return (
    <div
      id="offline-banner"
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-[9998] animate-slide-in-down"
    >
      <div
        className={`px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium ${
          isOffline
            ? 'bg-gray-900 text-white'
            : 'bg-amber-500 text-white'
        }`}
      >
        <div className="flex items-center gap-2">
          {isOffline ? (
            // Offline icon
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
            </svg>
          ) : (
            // Reconnecting spinner
            <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          )}

          <span>
            {isOffline
              ? "You're offline — file transfers require an active connection"
              : 'Reconnecting to signaling server…'}
          </span>
        </div>

        {isSignalingDown && (
          <div className="flex items-center gap-1 ml-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce-dot" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce-dot" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce-dot" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
