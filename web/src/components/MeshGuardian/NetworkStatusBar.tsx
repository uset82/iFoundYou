import { useNetworkStatus } from '../../lib/chat/useNetworkStatus';
import './NetworkStatusBar.css';

interface NetworkStatusBarProps {
  forceEmergency?: boolean;
  heartbeatUrl?: string | null;
}

/**
 * Compact pill that shows whether the app is Online, Offline, or in Emergency Mode.
 * Designed to be rendered inside the header/sidebar so users always see connection state.
 */
export default function NetworkStatusBar({
  forceEmergency = false,
  heartbeatUrl = null,
}: NetworkStatusBarProps) {
  const { status } = useNetworkStatus({ forceEmergency, heartbeatUrl });

  const config = {
    online: { label: 'Online', icon: '🌐', className: 'is-online' },
    offline: { label: 'Offline', icon: '📡', className: 'is-offline' },
    emergency: { label: 'Emergency Mode', icon: '⚠️', className: 'is-emergency' },
  }[status];

  return (
    <div
      className={`mesh-network-status ${config.className}`}
      role="status"
      aria-live="polite"
    >
      <span className="mesh-network-status__icon" aria-hidden="true">
        {config.icon}
      </span>
      <span className="mesh-network-status__label">{config.label}</span>
    </div>
  );
}
