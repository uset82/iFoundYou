/**
 * HTTP transport for Meshtastic ESP32 nodes — Phase 5.1 / 5.2 / 5.3
 *
 * Connects to a Meshtastic device over local Wi-Fi at `http://<ip>` (or
 * `https://<ip>` if the user trusts the self-signed cert). This is the
 * preferred mesh path on iOS Safari since Web Bluetooth is unsupported.
 *
 * Like BluetoothMeshTransport, the heavy `@meshtastic/*` packages are
 * dynamic-imported so the main app bundle stays buildable without Node
 * polyfills being eagerly loaded.
 */

import type {
  MeshConnectionState,
  MeshIncomingMessage,
  MeshNodeInfo,
  MeshTransport,
} from './MeshTransport';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_INITIAL_DELAY_MS = 2000;

type StateListener = (state: MeshConnectionState, info?: MeshNodeInfo) => void;
type MessageListener = (msg: MeshIncomingMessage) => void;

export interface HttpMeshConfig {
  /** Hostname or IP address (with optional :port), e.g. `192.168.4.1`. */
  address: string;
  /** Use HTTPS instead of HTTP. */
  tls?: boolean;
}

export class HttpMeshTransport implements MeshTransport {
  readonly name = 'meshtastic-http' as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transport: any | null = null;
  private state: MeshConnectionState = 'disconnected';
  private nodeInfo: MeshNodeInfo | null = null;
  private stateListeners: Set<StateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private reconnectAttempts = 0;
  private disposed = false;
  private config: HttpMeshConfig | null = null;

  /**
   * HTTP mode is available on every platform with `fetch`. The address is
   * supplied later via `connect(config)`.
   */
  async isAvailable(): Promise<boolean> {
    return typeof fetch !== 'undefined';
  }

  /**
   * Convenience overload: configure + connect in one call. The `MeshTransport`
   * interface only specifies `connect()` with no args, so callers that already
   * know the config can use this method instead.
   */
  async connectWithConfig(config: HttpMeshConfig): Promise<void> {
    this.config = config;
    await this.connect();
  }

  setConfig(config: HttpMeshConfig): void {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') return;
    if (!this.config) {
      this.setState('error');
      throw new Error('HTTP mesh transport: address not configured.');
    }

    this.disposed = false;
    this.setState('connecting');

    try {
      const [{ TransportHTTP }, { MeshDevice }] = await Promise.all([
        import('@meshtastic/transport-http'),
        import('@meshtastic/core'),
      ]);
      this.transport = await TransportHTTP.create(this.config.address, this.config.tls ?? false);
      this.device = new MeshDevice(this.transport);
      this.attachDeviceEvents();
      await this.device.configure();
      this.reconnectAttempts = 0;
    } catch (err) {
      this.setState('error');
      await this.cleanup();
      throw err;
    }
  }

  private attachDeviceEvents() {
    if (!this.device) return;
    const events = this.device.events;

    events.onDeviceStatus.subscribe((status: number) => {
      switch (status) {
        case 5:
        case 6:
        case 7:
          this.setState('connected');
          break;
        case 2:
          if (!this.disposed) {
            void this.maybeReconnect();
          } else {
            this.setState('disconnected');
          }
          break;
        case 4:
          this.setState('reconnecting');
          break;
        default:
          break;
      }
    });

    events.onMyNodeInfo.subscribe((info: any) => {
      this.nodeInfo = {
        ...this.nodeInfo,
        nodeNum: info.myNodeNum,
        firmwareVersion: this.nodeInfo?.firmwareVersion,
      };
      this.emitState();
    });

    events.onUserPacket.subscribe((packet: any) => {
      const u: any = packet.data;
      if (u && packet.from === this.nodeInfo?.nodeNum) {
        this.nodeInfo = {
          ...this.nodeInfo,
          longName: u.longName ?? this.nodeInfo?.longName,
          shortName: u.shortName ?? this.nodeInfo?.shortName,
          hwModel: u.hwModel ? String(u.hwModel) : this.nodeInfo?.hwModel,
        };
        this.emitState();
      }
    });

    events.onDeviceMetadataPacket.subscribe((packet: any) => {
      const meta: any = packet.data;
      if (meta) {
        this.nodeInfo = {
          ...this.nodeInfo,
          firmwareVersion: meta.firmwareVersion ?? this.nodeInfo?.firmwareVersion,
        };
        this.emitState();
      }
    });

    events.onMessagePacket.subscribe((packet: any) => {
      const msg: MeshIncomingMessage = {
        fromNodeNum: packet.from,
        channel: packet.channel,
        text: packet.data,
        receivedAt: packet.rxTime?.getTime() ?? Date.now(),
      };
      for (const listener of this.messageListeners) {
        try {
          listener(msg);
        } catch {
          // swallow listener errors
        }
      }
    });
  }

  async sendText(
    text: string,
    destination: number | 'broadcast' = 'broadcast',
    channel: number = 0,
  ): Promise<void> {
    if (!this.device) throw new Error('Not connected.');
    await this.device.sendText(text, destination, true, channel);
  }

  onMessage(handler: MessageListener): () => void {
    this.messageListeners.add(handler);
    return () => {
      this.messageListeners.delete(handler);
    };
  }

  onState(handler: StateListener): () => void {
    this.stateListeners.add(handler);
    handler(this.state, this.nodeInfo ?? undefined);
    return () => {
      this.stateListeners.delete(handler);
    };
  }

  getNodeInfo(): MeshNodeInfo | null {
    return this.nodeInfo;
  }

  getState(): MeshConnectionState {
    return this.state;
  }

  async disconnect(): Promise<void> {
    this.disposed = true;
    this.setState('disconnected');
    await this.cleanup();
  }

  private async cleanup() {
    try {
      if (this.transport) {
        await this.transport.disconnect();
      }
    } catch {
      // ignore disconnect errors
    }
    this.transport = null;
    this.device = null;
  }

  private setState(state: MeshConnectionState) {
    if (this.state === state) return;
    this.state = state;
    this.emitState();
  }

  private emitState() {
    for (const listener of this.stateListeners) {
      try {
        listener(this.state, this.nodeInfo ?? undefined);
      } catch {
        // swallow listener errors
      }
    }
  }

  private async maybeReconnect() {
    if (this.disposed) {
      this.setState('disconnected');
      return;
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setState('error');
      await this.cleanup();
      return;
    }
    this.reconnectAttempts += 1;
    this.setState('reconnecting');

    const delay = RECONNECT_INITIAL_DELAY_MS * 2 ** (this.reconnectAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.cleanup();
      await this.connect();
    } catch {
      void this.maybeReconnect();
    }
  }
}
