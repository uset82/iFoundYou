import {
  CATEGORY_META,
  CHANNEL_META,
  PRIORITY_META,
  decodeEmergencyMessage,
} from '../../lib/chat/emergency';
import './EmergencyBubble.css';

interface EmergencyBubbleProps {
  encoded: string;
}

/**
 * Renders an `EWS|...`-encoded emergency message with a priority-colored
 * border, category icon, channel, and optional location pin.
 */
export default function EmergencyBubble({ encoded }: EmergencyBubbleProps) {
  const parsed = decodeEmergencyMessage(encoded);
  if (!parsed) {
    return <div className="emergency-bubble emergency-bubble--invalid">{encoded}</div>;
  }
  const cat = CATEGORY_META[parsed.category];
  const pri = PRIORITY_META[parsed.priority];
  const ch = CHANNEL_META[parsed.channel];

  return (
    <div
      className={`emergency-bubble priority-${parsed.priority}`}
      style={
        {
          ['--eb-color' as any]: pri.color,
          ['--eb-cat-color' as any]: cat.color,
        } as React.CSSProperties
      }
    >
      <div className="emergency-bubble__header">
        <span className="emergency-bubble__cat" style={{ color: cat.color }}>
          {cat.icon} {cat.label}
        </span>
        <span className="emergency-bubble__priority">{pri.label}</span>
      </div>
      <div className="emergency-bubble__text">{parsed.text}</div>
      <div className="emergency-bubble__meta">
        <span>
          {ch.icon} {ch.label}
        </span>
        {Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon) && (
          <a
            href={`https://www.openstreetmap.org/?mlat=${parsed.lat}&mlon=${parsed.lon}#map=14/${parsed.lat}/${parsed.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="emergency-bubble__loc"
          >
            📍 {parsed.lat?.toFixed(3)}, {parsed.lon?.toFixed(3)}
          </a>
        )}
      </div>
    </div>
  );
}
