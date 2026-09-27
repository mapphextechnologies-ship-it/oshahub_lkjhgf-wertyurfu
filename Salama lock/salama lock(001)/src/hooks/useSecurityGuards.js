import { useEffect } from 'react';

function isBlockedShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;

  return (
    event.key === 'F12' ||
    (modifier && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
    (modifier && key === 'u')
  );
}

export function useSecurityGuards(enabled = import.meta.env.PROD) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    function handleContextMenu(event) {
      event.preventDefault();
    }

    function handleKeyDown(event) {
      if (!isBlockedShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);
}
