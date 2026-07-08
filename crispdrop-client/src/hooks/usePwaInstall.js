/**
 * hooks/usePwaInstall.js
 *
 * Captures the `beforeinstallprompt` event so we can trigger the PWA install
 * dialog from a custom branded button rather than the default browser UI.
 *
 * Also detects when the app is already installed in standalone mode.
 */

import { useState, useEffect, useCallback } from 'react';

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Detect if already running in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the default mini-infobar from appearing on mobile
      e.preventDefault();
      setPromptEvent(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  /**
   * triggerInstall — shows the native install prompt.
   * Returns 'accepted' | 'dismissed' | null.
   */
  const triggerInstall = useCallback(async () => {
    if (!promptEvent) return null;

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    if (outcome === 'accepted') {
      setIsInstallable(false);
      setPromptEvent(null);
    }

    return outcome;
  }, [promptEvent]);

  return { isInstallable, isInstalled, triggerInstall };
}
