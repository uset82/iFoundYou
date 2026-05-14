import { useEffect, useState } from 'react';
import { isIosSafari, isStandalone } from '../../lib/chat/platform';
import './IosInstallTutorial.css';

const DISMISS_KEY = 'ify:ios-install-dismissed';

/**
 * One-time prompt shown to iOS Safari users explaining how to install
 * the PWA to their home screen. Persists dismissal in localStorage.
 */
export default function IosInstallTutorial() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Wait a beat before showing so it doesn't compete with the initial paint
    const timer = setTimeout(() => setOpen(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="ios-install" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
      <div className="ios-install__backdrop" onClick={dismiss} />
      <div className="ios-install__card">
        <h3 id="ios-install-title" className="ios-install__title">
          Install Dommedag on your iPhone
        </h3>
        <p className="ios-install__lead">
          For the best experience including push alerts, offline messaging, and faster loads,
          add Dommedag to your home screen.
        </p>
        <ol className="ios-install__steps">
          <li>
            Tap the <strong>Share</strong> button{' '}
            <span className="ios-install__icon" aria-hidden="true">
              <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor">
                <path d="M7 12V2.5M3.5 6L7 2.5L10.5 6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 9V15.5C2 16.05 2.45 16.5 3 16.5H11C11.55 16.5 12 16.05 12 15.5V9" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              </svg>
            </span>{' '}
            in the Safari toolbar.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>{' '}
            <span className="ios-install__icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5V11M5 8H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
            .
          </li>
          <li>
            Tap <strong>Add</strong> in the top-right corner.
          </li>
        </ol>
        <div className="ios-install__actions">
          <button type="button" className="ios-install__primary" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
