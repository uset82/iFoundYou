/**
 * Web Bluetooth transport for Meshtastic devices — Phase 4.4 / 4.7 / 4.8 / 4.9 / 4.10
 *
 * Wraps `@meshtastic/transport-web-bluetooth` and `@meshtastic/core` to fit
 * our `MeshTransport` interface. Emits state + message events the rest of
 * the app can subscribe to.
 *
 * Note: the Meshtastic packages are loaded via dynamic import so the rest of
 * the app stays buildable on platforms where Node-only deps would normally
 * break the bundler (the `tslog` dep used by `@meshtastic/core` references
 * Node's `os`/`path`/`util` modules).
 */

import type {
  MeshConnectionState,
  MeshIncomingMessage,
  MeshNodeInfo,
  MeshTransport,
} from './MeshTransport';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_INITIAL_DELAY_MS = 1500;

type StateListener = (state: MeshConnectionState, info?: MeshNodeInfo) => void;
type MessageListener = (msg: MeshIncomingMessage) => void;

export class BluetoothMeshTransport implements MeshTransport {
  readonly name = 'meshtastic-ble' as const;

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

  async isAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const bt = (navigator as any).bluetooth;
    if (!bt) return false;
    if (typeof bt.getAvailability !== 'function') return true;
    try {
      return await bt.getAvailability();
    } catch {
      return true;
    }
  }

  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') return;
    if (!(await this.isAvailable())) {
      this.setState('error');
      throw new Error('Web Bluetooth is not available in this browser.');
    }

    this.disposed = false;
    this.setState('connecting');

    try {
      const [{ TransportWebBluetooth }, { MeshDevice }] = await Promise.all([
        import('@meshtastic/transport-web-bluetooth'),
        import('@meshtastic/core'),
      ]);
      this.transport = await TransportWebBluetooth.create();
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
      // Map @meshtastic/core's DeviceStatusEnum (1..7) to our simpler state.
      // 5 = Connected, 6 = Configuring, 7 = Configured, 2 = Disconnected
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
      if (u && (packet.from === this.nodeInfo?.nodeNum)) {
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
    // Emit current state immediately so subscribers don't miss the initial
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
