import { useEffect, useMemo, useState } from 'react';
import QuickButtons from './QuickButtons';
import {
  CATEGORY_META,
  CHANNEL_META,
  PRIORITY_META,
  EMERGENCY_TEXT_MAX,
  compressEmergencyText,
  encodeEmergencyMessage,
} from '../../lib/chat/emergency';
import type {
  EmergencyCategory,
  EmergencyChannel,
  EmergencyMessage,
  EmergencyPriority,
} from '../../lib/chat/emergency';
import './EmergencyComposer.css';

interface EmergencyComposerProps {
  /** Optional current GPS so users can attach their location. */
  position?: { lat: number; lon: number } | null;
  /**
   * Called with the encoded wire string (`EWS|...`). The host decides which
   * transport actually delivers it (Supabase / mesh / multipeer).
   */
  onSend: (encoded: string, message: EmergencyMessage) => Promise<void> | void;
  defaultChannel?: EmergencyChannel;
  busy?: boolean;
}

export default function EmergencyComposer({
  position,
  onSend,
  defaultChannel = 'family',
  busy = false,
}: EmergencyComposerProps) {
  const [category, setCategory] = useState<EmergencyCategory | null>(null);
  const [priority, setPriority] = useState<EmergencyPriority>('normal');
  const [channel, setChannel] = useState<EmergencyChannel>(defaultChannel);
  const [text, setText] = useState('');
  const [attachLocation, setAttachLocation] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // When the user picks a quick button, hydrate priority + default text.
  useEffect(() => {
    if (!category) return;
    const meta = CATEGORY_META[category];
    setPriority(meta.defaultPriority);
    setText((prev) => (prev.trim() ? prev : meta.defaultText));
  }, [category]);

  const charCount = text.length;
  const charsLeft = EMERGENCY_TEXT_MAX - charCount;
  const canSend = !busy && (category !== null || text.trim().length > 0);

  const compressed = useMemo(
    () => (text.trim() ? compressEmergencyText(text) : ''),
    [text],
  );

  const handleSend = async () => {
    setError(null);
    if (!canSend) {
      setError('Pick a category or type a message.');
      return;
    }
    if (charCount > EMERGENCY_TEXT_MAX) {
      setError(`Message is too long. Keep it under ${EMERGENCY_TEXT_MAX} characters.`);
      return;
    }

    const message: EmergencyMessage = {
      category: category ?? 'custom',
      priority,
      channel,
      text: text.trim() || CATEGORY_META[category ?? 'custom'].defaultText,
      ts: Date.now(),
      lat: attachLocation && position ? position.lat : undefined,
      lon: attachLocation && position ? position.lon : undefined,
    };

    try {
      await onSend(encodeEmergencyMessage(message), message);
      setCategory(null);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    }
  };

  return (
    <div className="emergency-composer">
      <div className="emergency-composer__section">
        <h3 className="emergency-composer__title">Quick alert</h3>
        <p className="muted">
          Tap a category for a one-tap message, or write a short note. All
          fields are kept short for LoRa delivery.
        </p>
        <QuickButtons
          selected={category}
          onSelect={(c) => setCategory(c)}
          disabled={busy}
        />
      </div>

      <div className="emergency-composer__section">
        <label className="field">
          <span>
            Message{' '}
            <span
              className={`emergency-composer__counter ${
                charsLeft < 0 ? 'is-over' : charsLeft < 30 ? 'is-low' : ''
              }`}
            >
              {charCount} / {EMERGENCY_TEXT_MAX}
            </span>
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, EMERGENCY_TEXT_MAX + 50))}
            rows={3}
            placeholder="School basement. Everyone alive. Need water + medicine."
            disabled={busy}
            maxLength={EMERGENCY_TEXT_MAX + 50}
          />
        </label>
        {compressed && compressed !== text.toUpperCase().trim() && (
          <p className="emergency-composer__compressed muted">
            <strong>On-wire form:</strong> {compressed} ({compressed.length} ch)
          </p>
        )}
      </div>

      <div className="emergency-composer__row">
        <label className="field">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as EmergencyPriority)}
            disabled={busy}
          >
            {Object.values(PRIORITY_META).map((p) => (
              <option key={p.label} value={p.label.toLowerCase()}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Channel
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as EmergencyChannel)}
            disabled={busy}
          >
            {Object.entries(CHANNEL_META).map(([id, meta]) => (
              <option key={id} value={id}>
                {meta.icon} {meta.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="emergency-composer__location">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={attachLocation && Boolean(position)}
            disabled={!position || busy}
            onChange={(e) => setAttachLocation(e.target.checked)}
          />
          Attach my location{' '}
          {position ? (
            <span className="muted">
              ({position.lat.toFixed(4)}, {position.lon.toFixed(4)})
            </span>
          ) : (
            <span className="muted">(not available — start sharing)</span>
          )}
        </label>
      </div>

      <div className="emergency-composer__actions">
        <button
          type="button"
          className="primary emergency-composer__send"
          style={
            {
              ['--ec-color' as any]: PRIORITY_META[priority].color,
            } as React.CSSProperties
          }
          onClick={() => void handleSend()}
          disabled={!canSend || charCount > EMERGENCY_TEXT_MAX}
        >
          Send {category ? CATEGORY_META[category].label : 'message'} ·{' '}
          {PRIORITY_META[priority].label}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
