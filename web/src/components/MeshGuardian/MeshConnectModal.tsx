import { useState } from 'react';
import { useMeshtasticBle } from '../../lib/mesh/useMeshtasticBle';
import { isInIosNativeApp, supportsWebBluetooth } from '../../lib/chat/platform';
import './MeshConnectModal.css';

interface MeshConnectModalProps {
  onClose: () => void;
}

const STATE_LABEL: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Error',
};

const STATE_CLASS: Record<string, string> = {
  disconnected: 'is-disconnected',
  connecting: 'is-connecting',
  connected: 'is-connected',
  reconnecting: 'is-connecting',
  error: 'is-error',
};

export default function MeshConnectModal({ onClose }: MeshConnectModalProps) {
  const ble = useMeshtasticBle();
  const [testText, setTestText] = useState('Hello mesh');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const sendTest = async () => {
    setTestStatus(null);
    try {
      await ble.sendText(testText);
      setTestStatus('Sent.');
    } catch (err) {
      setTestStatus(err instanceof Error ? err.message : 'Send failed.');
    }
  };

  const isIosWeb = !supportsWebBluetooth() && !isInIosNativeApp();

  return (
    <div className="mesh-connect-modal" role="dialog" aria-modal="true">
      <div className="mesh-connect-modal__backdrop" onClick={onClose} />
      <div className="mesh-connect-modal__card">
        <div className="mesh-connect-modal__header">
          <h3>Meshtastic Bluetooth</h3>
          <button type="button" className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className={`mesh-connect-modal__pill ${STATE_CLASS[ble.state] ?? ''}`}>
          <span className="mesh-connect-modal__pill-dot" />
          {STATE_LABEL[ble.state] ?? ble.state}
          {ble.nodeInfo?.longName && ble.state === 'connected' && (
            <span className="mesh-connect-modal__pill-node">
              · {ble.nodeInfo.longName}
            </span>
          )}
        </div>

        {!ble.supported && isIosWeb && (
          <div className="mesh-connect-modal__notice">
            <strong>iOS Safari can't pair with Meshtastic via Bluetooth.</strong>
            <p className="muted">
              Web Bluetooth isn't supported on iPhone or iPad in Safari. You have
              two options:
            </p>
            <ul>
              <li>Connect to an ESP32 Meshtastic node over Wi-Fi (HTTP mode).</li>
              <li>
                Install the iFoundYou native app from TestFlight to use a real
                Meshtastic LoRa device.
              </li>
            </ul>
          </div>
        )}

        {!ble.supported && !isIosWeb && (
          <div className="mesh-connect-modal__notice">
            <strong>Web Bluetooth isn't available in this browser.</strong>
            <p className="muted">
              Try Chrome on Android or desktop, or use the Wi-Fi/HTTP mesh option
              instead.
            </p>
          </div>
        )}

        {ble.supported && (
          <>
            <div className="mesh-connect-modal__actions">
              {ble.state !== 'connected' ? (
                <button
                  className="primary"
                  onClick={() => void ble.connect()}
                  disabled={ble.state === 'connecting' || ble.state === 'reconnecting'}
                >
                  {ble.state === 'connecting' || ble.state === 'reconnecting'
                    ? 'Connecting…'
                    : 'Connect Meshtastic device'}
                </button>
              ) : (
                <button className="ghost" onClick={() => void ble.disconnect()}>
                  Disconnect
                </button>
              )}
            </div>
            {ble.error && <p className="error">{ble.error}</p>}

            {ble.state === 'connected' && (
              <div className="mesh-connect-modal__panel">
                <h4>Node info</h4>
                <dl className="mesh-connect-modal__info">
                  <dt>Node #</dt>
                  <dd>{ble.nodeInfo?.nodeNum ?? '—'}</dd>
                  <dt>Long name</dt>
                  <dd>{ble.nodeInfo?.longName ?? '—'}</dd>
                  <dt>Short name</dt>
                  <dd>{ble.nodeInfo?.shortName ?? '—'}</dd>
                  <dt>Hardware</dt>
                  <dd>{ble.nodeInfo?.hwModel ?? '—'}</dd>
                  <dt>Firmware</dt>
                  <dd>{ble.nodeInfo?.firmwareVersion ?? '—'}</dd>
                </dl>

                <h4>Send a test message</h4>
                <div className="mesh-connect-modal__send">
                  <input
                    type="text"
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="Hello mesh"
                    maxLength={200}
                  />
                  <button
                    className="primary"
                    onClick={() => void sendTest()}
                    disabled={!testText.trim()}
                  >
                    Send
                  </button>
                </div>
                {testStatus && (
                  <p className={testStatus === 'Sent.' ? 'muted' : 'error'}>
                    {testStatus}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
