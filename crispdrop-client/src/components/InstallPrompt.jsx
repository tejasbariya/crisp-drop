/**
 * components/InstallPrompt.jsx
 *
 * Custom branded PWA install prompt.
 * Triggers the `beforeinstallprompt` native dialog via usePwaInstall hook.
 * Shows only when the app is installable and not yet installed.
 */

import React, { useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';

export function InstallPrompt() {
  const { isInstallable, isInstalled, triggerInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  // Don't render if not installable, already installed, or dismissed
  if (!isInstallable || isInstalled || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    const outcome = await triggerInstall();
    setInstalling(false);
    if (outcome === 'dismissed') {
      // Keep the prompt visible until explicitly dismissed
    }
  };

  return (
    <div
      id="install-prompt"
      role="complementary"
      aria-label="Install Crispdrop"
      className="fixed bottom-6 right-6 z-50 animate-slide-in-up"
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        right: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      <div className="glass card flex items-center gap-4 px-5 py-4 max-w-sm shadow-xl-soft">
        {/* App icon */}
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center flex-shrink-0 shadow-indigo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L8 8H4l4 4-1.5 6L12 15l5.5 3L16 12l4-4h-4L12 2z" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">Install Crispdrop</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Works offline & launches instantly
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            id="install-prompt-dismiss"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss install prompt"
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <button
            id="install-prompt-accept"
            onClick={handleInstall}
            disabled={installing}
            className="btn-primary !px-3.5 !py-2 !text-sm !rounded-xl"
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
