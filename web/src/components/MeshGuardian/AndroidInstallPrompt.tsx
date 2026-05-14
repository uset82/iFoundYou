import { useEffect, useState } from 'react';
import './AndroidInstallPrompt.css';

// Define the BeforeInstallPromptEvent interface since it's not standard in TypeScript yet
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function AndroidInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Update UI notify the user they can install the PWA
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If the app is already installed, we might want to hide it
    window.addEventListener('appinstalled', () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="android-install-banner">
      <div className="android-install-content">
        <div className="android-install-icon">
          <svg viewBox="0 0 64 64" role="img" focusable="false" width="24" height="24">
            <path d="M32 3C20.95 3 12 12.22 12 23.6c0 15.05 20 37.4 20 37.4s20-22.35 20-37.4C52 12.22 43.05 3 32 3z" fill="currentColor"/>
            <circle cx="32" cy="24" r="8" fill="#000" />
          </svg>
        </div>
        <div className="android-install-text">
          <strong>Add Dommedag to Home Screen</strong>
          <span className="muted">Use it offline and get push alerts.</span>
        </div>
      </div>
      <div className="android-install-actions">
        <button className="ghost small" onClick={handleDismiss}>Not now</button>
        <button className="primary small" onClick={handleInstallClick}>Install</button>
      </div>
    </div>
  );
}
