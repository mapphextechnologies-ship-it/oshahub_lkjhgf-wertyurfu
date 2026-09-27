import { useEffect, useState } from 'react';

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setPromptEvent(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    function handleDisplayModeChange() {
      setInstalled(isStandaloneDisplay());
    }

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => setServiceWorkerReady(true))
        .catch(() => setServiceWorkerReady(false));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  async function install() {
    if (!promptEvent) {
      const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
      window.alert(isIos
        ? 'To install SALAMA LOCK, tap Share, then choose Add to Home Screen.'
        : 'To install SALAMA LOCK, open the browser menu and choose Install app or Add to Home Screen. If that option is missing, refresh once and make sure you are using the live HTTPS site.');
      return;
    }
    promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  return {
    canInstall: !installed,
    install,
    installReady: Boolean(promptEvent),
    serviceWorkerReady
  };
}
