import { useState } from 'react';
import { useMeshtasticBle } from '../../lib/mesh/useMeshtasticBle';
import { useMeshtasticHttp } from '../../lib/mesh/useMeshtasticHttp';
import { isInIosNativeApp, isIosSafari, supportsWebBluetooth } from '../../lib/chat/platform';
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

type Tab = 'bluetooth' | 'wifi';

export default function MeshConnectModal({ onClose }: MeshConnectModalProps) {
  const ble = useMeshtasticBle();
  const http = useMeshtasticHttp();
  const isIosWeb = !supportsWebBluetooth() && !isInIosNativeApp();

  // Default tab: Wi-Fi for iOS Safari (since BLE isn't available), Bluetooth elsewhere
  const [tab, setTab] = useState<Tab>(isIosWeb || isIosSafari() ? 'wifi' : 'bluetooth');

  return (
    <div className="mesh-connect-modal" role="dialog" aria-modal="true">
      <div className="mesh-connect-modal__backdrop" onClick={onClose} />
      <div className="mesh-connect-modal__card">
        <div className="mesh-connect-modal__header">
          <h3>Meshtastic node</h3>
          <button type="button" className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mesh-connect-modal__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bluetooth'}
            className={`mesh-connect-modal__tab ${tab === 'bluetooth' ? 'is-active' : ''}`}
            onClick={() => setTab('bluetooth')}
          >
            📶 Bluetooth
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'wifi'}
            className={`mesh-connect-modal__tab ${tab === 'wifi' ? 'is-active' : ''}`}
            onClick={() => setTab('wifi')}
          >
            📡 Wi-Fi (ESP32)
          </button>
        </div>

        {tab === 'bluetooth' && (
          <BluetoothPanel
            ble={ble}
            isIosWeb={isIosWeb}
            switchToWifi={() => setTab('wifi')}
          />
        )}
        {tab === 'wifi' && <WifiPanel http={http} />}
      </div>
    </div>
  );
}

interface BluetoothPanelProps {
  ble: ReturnType<typeof useMeshtasticBle>;
  isIosWeb: boolean;
  switchToWifi: () => void;
}

function BluetoothPanel({ ble, isIosWeb, switchToWifi }: BluetoothPanelProps) {
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

  return (
    <>
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
          <strong>iOS Safari can't pair via Bluetooth.</strong>
          <p className="muted">
            Web Bluetooth isn't supported on iPhone or iPad in Safari. Use the
            Wi-Fi tab to connect to an ESP32 node instead.
          </p>
          <button className="primary small" onClick={switchToWifi}>
            Switch to Wi-Fi
          </button>
        </div>
      )}

      {!ble.supported && !isIosWeb && (
        <div className="mesh-connect-modal__notice">
          <strong>Web Bluetooth isn't available in this browser.</strong>
          <p className="muted">
            Try Chrome on Android or desktop, or use the Wi-Fi tab for an ESP32
            Meshtastic node.
          </p>
          <button className="primary small" onClick={switchToWifi}>
            Switch to Wi-Fi
          </button>
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
    </>
  );
}

interface WifiPanelProps {
  http: ReturnType<typeof useMeshtasticHttp>;
}

function WifiPanel({ http }: WifiPanelProps) {
  const [address, setAddress] = useState(http.config?.address ?? '192.168.4.1');
  const [tls, setTls] = useState(http.config?.tls ?? false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [testText, setTestText] = useState('Hello mesh');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const handleConnect = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    void http.connect({ address: trimmed, tls });
  };

  const sendTest = async () => {
    setTestStatus(null);
    try {
      await http.sendText(testText);
      setTestStatus('Sent.');
    } catch (err) {
      setTestStatus(err instanceof Error ? err.message : 'Send failed.');
    }
  };

  return (
    <>
      <div className={`mesh-connect-modal__pill ${STATE_CLASS[http.state] ?? ''}`}>
        <span className="mesh-connect-modal__pill-dot" />
        {STATE_LABEL[http.state] ?? http.state}
        {http.nodeInfo?.longName && http.state === 'connected' && (
          <span className="mesh-connect-modal__pill-node">
            · {http.nodeInfo.longName}
          </span>
        )}
      </div>

      <div className="mesh-connect-modal__notice">
        Connect to a Meshtastic ESP32 device on your local Wi-Fi. Works on every
        platform including iPhone Safari.
      </div>

      <label className="field">
        Node address
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="192.168.4.1"
          spellCheck={false}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          disabled={http.state === 'connecting' || http.state === 'reconnecting'}
        />
      </label>

      <label className="checkbox-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={tls}
          onChange={(e) => setTls(e.target.checked)}
          disabled={http.state === 'connecting' || http.state === 'reconnecting'}
        />
        Use HTTPS (requires trusting the device's self-signed cert first)
      </label>

      <div className="mesh-connect-modal__actions">
        {http.state !== 'connected' ? (
          <button
            className="primary"
            onClick={handleConnect}
            disabled={
              !address.trim() ||
              http.state === 'connecting' ||
              http.state === 'reconnecting'
            }
          >
            {http.state === 'connecting' || http.state === 'reconnecting'
              ? 'Connecting…'
              : 'Connect to node'}
          </button>
        ) : (
          <button className="ghost" onClick={() => void http.disconnect()}>
            Disconnect
          </button>
        )}
      </div>
      {http.error && <p className="error">{http.error}</p>}

      <div>
        <button
          type="button"
          className="ghost small"
          onClick={() => setShowInstructions((v) => !v)}
        >
          {showInstructions ? '▾ Hide setup instructions' : '▸ Setup instructions'}
        </button>
        {showInstructions && (
          <div className="mesh-connect-modal__instructions">
            <ol>
              <li>
                Flash Meshtastic firmware on a supported ESP32 device
                (Heltec / TTGO / RAK WisBlock).
              </li>
              <li>
                In the Meshtastic Android or iOS app, set <strong>Network ▸ Wi-Fi</strong> with
                your local Wi-Fi SSID + password and reboot the node.
              </li>
              <li>
                Find the node's IP address on your router (or use the Meshtastic
                app's Settings ▸ Network panel). Type that IP in the field above.
              </li>
              <li>
                If you turn on HTTPS, open <code>https://&lt;ip&gt;</code> once
                in the same browser and accept the self-signed certificate.
                Otherwise leave HTTPS off.
              </li>
              <li>
                <strong>iPhone Safari users</strong>: this is the recommended
                mesh path. Web Bluetooth is unavailable on iOS Safari, so HTTP
                over Wi-Fi is the most reliable mesh-without-an-app option.
              </li>
            </ol>
          </div>
        )}
      </div>

      {http.state === 'connected' && (
        <div className="mesh-connect-modal__panel">
          <h4>Node info</h4>
          <dl className="mesh-connect-modal__info">
            <dt>Node #</dt>
            <dd>{http.nodeInfo?.nodeNum ?? '—'}</dd>
            <dt>Long name</dt>
            <dd>{http.nodeInfo?.longName ?? '—'}</dd>
            <dt>Short name</dt>
            <dd>{http.nodeInfo?.shortName ?? '—'}</dd>
            <dt>Hardware</dt>
            <dd>{http.nodeInfo?.hwModel ?? '—'}</dd>
            <dt>Firmware</dt>
            <dd>{http.nodeInfo?.firmwareVersion ?? '—'}</dd>
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
  );
}
