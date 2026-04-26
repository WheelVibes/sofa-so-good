import { useEffect } from 'react';

/**
 * Subscribes to keydown events globally. The handler is fired with the
 * raw KeyboardEvent.code (e.g. 'KeyW', 'Escape'). Listeners are removed
 * on unmount.
 */
export function useKeyboard(handler: (code: string, e: KeyboardEvent) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      handler(e.code, e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
