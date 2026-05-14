import { useEffect, useState } from 'react';

/**
 * True when the document is currently visible AND focused.
 * Used to decide whether to fire a browser notification for incoming messages.
 */
export function useDocumentVisibility() {
  const [active, setActive] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible' && document.hasFocus();
  });

  useEffect(() => {
    const update = () =>
      setActive(document.visibilityState === 'visible' && document.hasFocus());

    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  return active;
}
