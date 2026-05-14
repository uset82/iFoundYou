import { useTransportManager } from '../../lib/chat/useTransportManager';
import { TRANSPORT_INFO } from '../../lib/chat/ChatTransport';
import './TransportIndicator.css';

interface TransportIndicatorProps {
  /** Show the Force-Emergency toggle button next to the indicator. */
  showToggle?: boolean;
  /** Compact mode hides the label and just shows the icon. */
  compact?: boolean;
}

/**
 * Status pill that shows which transport the chat layer is currently
 * preferring (🌐 Internet / 📡 Mesh-BT / 📡 Mesh-WiFi / 📲 Multipeer / no link).
 *
 * Phase 6.8 / 6.9
 */
export default function TransportIndicator({
  showToggle = false,
  compact = false,
}: TransportIndicatorProps) {
  const tm = useTransportManager();

  const info = tm.activeTransport ? TRANSPORT_INFO[tm.activeTransport] : null;
  const label = info?.label ?? 'Offline';
  const icon = info?.icon ?? '⚪';

  return (
    <div className="transport-indicator">
      <span
        className={`transport-indicator__pill ${
          tm.activeTransport ? `is-${tm.activeTransport}` : 'is-offline'
        } ${tm.forcingEmergency ? 'is-emergency-forced' : ''}`}
        title={
          tm.activeTransport
            ? `Messages are being routed via ${label}`
            : 'No transport available — messages will be queued offline'
        }
      >
        <span className="transport-indicator__icon" aria-hidden="true">
          {icon}
        </span>
        {!compact && <span className="transport-indicator__label">{label}</span>}
        {tm.forcingEmergency && !compact && (
          <span className="transport-indicator__badge">EMRG</span>
        )}
      </span>

      {showToggle && (
        <button
          type="button"
          className={`transport-indicator__toggle ${tm.forcingEmergency ? 'is-on' : ''}`}
          onClick={() => tm.setForceEmergency(!tm.forcingEmergency)}
          title={
            tm.forcingEmergency
              ? 'Disable forced Emergency Mode (uses internet first again)'
              : 'Force Emergency Mode (always try mesh first, even when online)'
          }
        >
          {tm.forcingEmergency ? '⚠ Forcing emergency' : '⚠ Force emergency'}
        </button>
      )}

      {tm.failedCount > 0 && (
        <button
          type="button"
          className="transport-indicator__retry"
          onClick={() => void tm.retryFailed()}
          title={`${tm.failedCount} message(s) failed across all transports — click to retry`}
        >
          ↻ {tm.failedCount} failed
        </button>
      )}
    </div>
  );
}
