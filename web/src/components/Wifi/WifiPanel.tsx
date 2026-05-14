import { useCallback, useEffect, useState } from 'react';
import './WifiPanel.css';

const API_BASE = 'http://localhost:7829';

type WifiNetwork = {
  ssid: string;
  bssid: string | null;
  signal: number | null;
  encryption: string;
  channel: number | null;
};

type WifiUser = {
  ip: string;
  mac: string;
  type: string;
};

type ConnectionInfo = {
  interface: string | null;
  ssid: string | null;
  bssid: string | null;
  gateway_ip: string | null;
  gateway_mac: string | null;
  mac_address: string | null;
};

type NetInterface = {
  name: string;
  device: string;
  mac: string;
};

function signalLevel(signal: number | null): number {
  if (signal === null) return 0;
  if (signal >= 75) return 4;
  if (signal >= 50) return 3;
  if (signal >= 25) return 2;
  return 1;
}

function SignalBars({ signal }: { signal: number | null }) {
  const level = signalLevel(signal);
  return (
    <div className={`wifi-signal-bars sig-${level}`}>
      <div className="bar" />
      <div className="bar" />
      <div className="bar" />
      <div className="bar" />
    </div>
  );
}

export default function WifiPanel() {
  const [companionOnline, setCompanionOnline] = useState(false);
  const [checking, setChecking] = useState(true);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [users, setUsers] = useState<WifiUser[]>([]);
  const [interfaces, setInterfaces] = useState<NetInterface[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanningUsers, setScanningUsers] = useState(false);
  const [spoofBusy, setSpoofBusy] = useState(false);
  const [spoofMsg, setSpoofMsg] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState<string | null>(null);
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [selectedIface, setSelectedIface] = useState('');
  const [customMac, setCustomMac] = useState('');

  const checkCompanion = useCallback(async () => {
    setChecking(true);
    try {
      const r = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const data = await r.json();
        setCompanionOnline(true);
        setConnection(data.connection ?? null);
      } else {
        setCompanionOnline(false);
      }
    } catch {
      setCompanionOnline(false);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkCompanion();
    const id = setInterval(() => void checkCompanion(), 15000);
    return () => clearInterval(id);
  }, [checkCompanion]);

  useEffect(() => {
    if (!companionOnline) return;
    fetch(`${API_BASE}/api/interfaces`)
      .then((r) => r.json())
      .then((d) => {
        setInterfaces(d.interfaces ?? []);
        if (d.interfaces?.length && !selectedIface) {
          setSelectedIface(d.interfaces[0].name);
        }
      })
      .catch(() => {});
  }, [companionOnline, selectedIface]);

  const scanNetworks = async () => {
    setScanning(true);
    try {
      const r = await fetch(`${API_BASE}/api/networks`);
      const d = await r.json();
      setNetworks(d.networks ?? []);
    } catch {
      setNetworks([]);
    }
    setScanning(false);
  };

  const scanUsers = async () => {
    setScanningUsers(true);
    try {
      const r = await fetch(`${API_BASE}/api/users`);
      const d = await r.json();
      setUsers(d.users ?? []);
    } catch {
      setUsers([]);
    }
    setScanningUsers(false);
  };

  const doRandomize = async () => {
    if (!selectedIface) return;
    setSpoofBusy(true);
    setSpoofMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/mac/randomize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selectedIface }),
      });
      const d = await r.json();
      setSpoofMsg(d.message + (d.new_mac ? ` → ${d.new_mac}` : ''));
      void checkCompanion();
    } catch (e) {
      setSpoofMsg('Failed to reach companion server.');
    }
    setSpoofBusy(false);
  };

  const doSetMac = async () => {
    if (!selectedIface || !customMac.trim()) return;
    setSpoofBusy(true);
    setSpoofMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/mac/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selectedIface, mac: customMac.trim() }),
      });
      const d = await r.json();
      setSpoofMsg(d.message);
      void checkCompanion();
    } catch {
      setSpoofMsg('Failed to reach companion server.');
    }
    setSpoofBusy(false);
  };

  const doReset = async () => {
    if (!selectedIface) return;
    setSpoofBusy(true);
    setSpoofMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/mac/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selectedIface }),
      });
      const d = await r.json();
      setSpoofMsg(d.message);
      void checkCompanion();
    } catch {
      setSpoofMsg('Failed to reach companion server.');
    }
    setSpoofBusy(false);
  };

  const doConnect = async (ssid: string) => {
    setConnectBusy(ssid);
    setConnectMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid }),
      });
      const d = await r.json();
      setConnectMsg(d.message);
      if (d.success) void checkCompanion();
    } catch {
      setConnectMsg('Failed to reach companion server.');
    }
    setConnectBusy(null);
  };

  const doCloneMac = async (mac: string) => {
    if (!selectedIface) return;
    setSpoofBusy(true);
    setSpoofMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/mac/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: selectedIface, mac }),
      });
      const d = await r.json();
      setSpoofMsg(`Cloned: ${d.message}`);
      void checkCompanion();
    } catch {
      setSpoofMsg('Failed to reach companion server.');
    }
    setSpoofBusy(false);
  };

  return (
    <section className="wifi-panel">
      <div className="panel-header">
        <h2>📶 WiFi Tools</h2>
        <p className="muted">
          Scan networks, connect to open WiFi, and manage your MAC address.
        </p>
      </div>

      {/* Companion status */}
      <div className="wifi-status-bar">
        <span
          className={`wifi-status-dot ${
            checking ? 'scanning' : companionOnline ? 'connected' : 'disconnected'
          }`}
        />
        <div className="wifi-status-info">
          <strong>
            {checking
              ? 'Checking companion...'
              : companionOnline
                ? `Connected — ${connection?.ssid ?? 'No WiFi'}`
                : 'Companion offline'}
          </strong>
          {companionOnline && connection?.mac_address && (
            <span>MAC: {connection.mac_address}</span>
          )}
          {companionOnline && connection?.gateway_ip && (
            <span>
              Gateway: {connection.gateway_ip}
              {connection.gateway_mac ? ` (${connection.gateway_mac})` : ''}
            </span>
          )}
        </div>
        <button className="ghost small" onClick={() => void checkCompanion()}>
          Refresh
        </button>
      </div>

      {!companionOnline && !checking && (
        <div className="companion-banner">
          <h4>⚡ Start the WiFi Companion</h4>
          <p>
            The WiFi tools need a local Python server running on your machine.
            Install dependencies and start it:
          </p>
          <code>
            cd wifi && pip install -r requirements.txt
            <br />
            python server.py
          </code>
          <p style={{ marginTop: '0.5rem' }}>
            Run as <strong>Administrator</strong> (Windows) or with{' '}
            <strong>sudo</strong> (Mac/Linux) for MAC spoofing.
          </p>
        </div>
      )}

      {companionOnline && (
        <div className="panel-grid">
          {/* ── Network Scanner ─────────────────────────────── */}
          <div className="card">
            <h3>Nearby Networks</h3>
            <div className="contact-actions" style={{ marginBottom: '0.75rem' }}>
              <button
                className="primary"
                onClick={() => void scanNetworks()}
                disabled={scanning}
              >
                {scanning ? 'Scanning...' : 'Scan WiFi'}
              </button>
            </div>
            {connectMsg && <p className="muted">{connectMsg}</p>}
            {networks.length === 0 ? (
              <p className="muted">
                {scanning ? 'Scanning...' : 'Click Scan to discover networks.'}
              </p>
            ) : (
              <div className="wifi-network-list">
                {networks.map((net, i) => {
                  const isOpen =
                    net.encryption.toLowerCase() === 'open' ||
                    net.encryption.toLowerCase() === 'none' ||
                    net.encryption === '';
                  return (
                    <div
                      key={`${net.ssid}-${net.bssid}-${i}`}
                      className="wifi-network-row"
                      onClick={() => isOpen && void doConnect(net.ssid)}
                      title={isOpen ? `Click to connect to ${net.ssid}` : net.encryption}
                    >
                      <SignalBars signal={net.signal} />
                      <div className="wifi-network-info">
                        <span className="ssid">{net.ssid || '(Hidden)'}</span>
                        <span className="meta">
                          Ch {net.channel ?? '?'}
                          {net.bssid ? ` · ${net.bssid}` : ''}
                          {net.signal !== null ? ` · ${net.signal}%` : ''}
                        </span>
                      </div>
                      <span className={`wifi-tag ${isOpen ? 'open' : 'encrypted'}`}>
                        {isOpen ? 'Open' : net.encryption}
                      </span>
                      {isOpen && (
                        <button
                          className="ghost small"
                          disabled={connectBusy === net.ssid}
                          onClick={(e) => {
                            e.stopPropagation();
                            void doConnect(net.ssid);
                          }}
                        >
                          {connectBusy === net.ssid ? '...' : 'Join'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── MAC Spoofing ────────────────────────────────── */}
          <div className="card">
            <h3>MAC Address</h3>
            <p className="muted">
              Change your MAC to get additional time on captive portals or for
              privacy.
            </p>
            {interfaces.length > 0 && (
              <label className="field">
                Interface
                <select
                  value={selectedIface}
                  onChange={(e) => setSelectedIface(e.target.value)}
                >
                  {interfaces.map((iface) => (
                    <option key={iface.name} value={iface.name}>
                      {iface.name} — {iface.mac}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {connection?.mac_address && (
              <div className="mac-display">
                <span className="mac-label">Current:</span>
                {connection.mac_address}
              </div>
            )}
            <div className="mac-actions">
              <button
                className="primary"
                onClick={() => void doRandomize()}
                disabled={spoofBusy || !selectedIface}
              >
                Randomize MAC
              </button>
              <button
                className="ghost"
                onClick={() => void doReset()}
                disabled={spoofBusy || !selectedIface}
              >
                Reset MAC
              </button>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label className="field">
                Set specific MAC
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={customMac}
                    onChange={(e) => setCustomMac(e.target.value)}
                    placeholder="aa:bb:cc:dd:ee:ff"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost small"
                    onClick={() => void doSetMac()}
                    disabled={spoofBusy || !customMac.trim()}
                  >
                    Set
                  </button>
                </div>
              </label>
            </div>
            {spoofMsg && <p className="muted">{spoofMsg}</p>}
          </div>

          {/* ── Network Users ──────────────────────────────── */}
          <div className="card">
            <h3>Devices on Network</h3>
            <p className="muted">
              Discover active devices. Clone a MAC to piggyback on their
              connection (use responsibly).
            </p>
            <div className="contact-actions" style={{ marginBottom: '0.75rem' }}>
              <button
                className="primary"
                onClick={() => void scanUsers()}
                disabled={scanningUsers}
              >
                {scanningUsers ? 'Scanning...' : 'Discover Devices'}
              </button>
            </div>
            {users.length === 0 ? (
              <p className="muted">
                {scanningUsers ? 'Scanning...' : 'No devices found yet.'}
              </p>
            ) : (
              <div className="wifi-users-list">
                {users.map((user, i) => (
                  <div key={`${user.mac}-${i}`} className="wifi-user-row">
                    <div>
                      <span className="user-mac">{user.mac}</span>
                      <span className="user-ip"> — {user.ip}</span>
                    </div>
                    <button
                      className="ghost small"
                      onClick={() => void doCloneMac(user.mac)}
                      disabled={spoofBusy}
                      title="Clone this MAC address"
                    >
                      Clone
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Disclaimer ─────────────────────────────────── */}
          <div className="wifi-disclaimer">
            ⚠️ <strong>Legal Notice:</strong> MAC address spoofing may be
            restricted in your jurisdiction. This tool is intended for privacy
            and emergency connectivity in disaster scenarios. Use responsibly.
            Inspired by{' '}
            <a
              href="https://github.com/kylemcdonald/FreeWifi"
              target="_blank"
              rel="noreferrer"
            >
              FreeWifi
            </a>{' '}
            and{' '}
            <a
              href="https://github.com/feross/SpoofMAC"
              target="_blank"
              rel="noreferrer"
            >
              SpoofMAC
            </a>
            .
          </div>
        </div>
      )}
    </section>
  );
}
