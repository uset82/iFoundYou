/**
 * TransportManager — Phase 6.4 / 6.5 / 6.6 / 6.7 / 6.9 / 6.10
 *
 * Single point that decides which physical transport delivers a chat
 * message. Holds a priority list, runs availability checks, fans incoming
 * messages out to subscribers, and falls over to the next transport if
 * the preferred one fails.
 */

import type {
  ChatTransport,
  ChatTransportKind,
  IncomingChatMessage,
  OutgoingChatMessage,
} from './ChatTransport';
import { InternetTransport } from './transports/InternetTransport';
import { MeshChatAdapter } from './transports/MeshChatAdapter';
import { BluetoothMeshTransport } from '../mesh/transports/BluetoothMeshTransport';
import { HttpMeshTransport } from '../mesh/transports/HttpMeshTransport';

export interface SendOutcome {
  /** Which transport actually delivered the message */
  transport: ChatTransportKind;
  /** Server / mesh id when available */
  id?: string;
}

export interface FailedSendEntry {
  message: OutgoingChatMessage;
  attemptedTransports: ChatTransportKind[];
  lastError: string;
  failedAt: number;
}

type IncomingHandler = (msg: IncomingChatMessage) => void;

/**
 * Default priority. The `forceEmergency` toggle pushes mesh transports above
 * internet to simulate offline mode.
 */
const DEFAULT_PRIORITY: ChatTransportKind[] = [
  'internet',
  'meshtastic-ble',
  'meshtastic-http',
  'multipeer',
];

const EMERGENCY_PRIORITY: ChatTransportKind[] = [
  'meshtastic-ble',
  'meshtastic-http',
  'multipeer',
  'internet',
];

export class TransportManager {
  private internet: InternetTransport;
  private meshBle: BluetoothMeshTransport | null = null;
  private meshHttp: HttpMeshTransport | null = null;
  private bleAdapter: MeshChatAdapter | null = null;
  private httpAdapter: MeshChatAdapter | null = null;

  private listeners: Set<IncomingHandler> = new Set();
  private currentUserId: string | null = null;
  private forceEmergency = false;
  private failedQueue: FailedSendEntry[] = [];

  constructor() {
    this.internet = new InternetTransport();
  }

  /**
   * Register the shared BLE / HTTP transports created by the React hooks.
   * Called once during app boot so the manager and the hooks operate on the
   * same instance.
   */
  registerBle(ble: BluetoothMeshTransport): void {
    if (this.meshBle === ble) return;
    if (this.bleAdapter) this.bleAdapter.detach();
    this.meshBle = ble;
    this.bleAdapter = new MeshChatAdapter(ble);
    if (this.currentUserId) {
      this.bleAdapter.attach();
      this.bleAdapter.onMessage((msg) => this.fanOut(msg));
    }
  }

  registerHttp(http: HttpMeshTransport): void {
    if (this.meshHttp === http) return;
    if (this.httpAdapter) this.httpAdapter.detach();
    this.meshHttp = http;
    this.httpAdapter = new MeshChatAdapter(http);
    if (this.currentUserId) {
      this.httpAdapter.attach();
      this.httpAdapter.onMessage((msg) => this.fanOut(msg));
    }
  }

  attachUser(userId: string): void {
    this.currentUserId = userId;
    this.internet.attach(userId);
    if (this.bleAdapter) this.bleAdapter.attach();
    if (this.httpAdapter) this.httpAdapter.attach();

    this.internet.onMessage((msg) => this.fanOut(msg));
    if (this.bleAdapter) this.bleAdapter.onMessage((msg) => this.fanOut(msg));
    if (this.httpAdapter) this.httpAdapter.onMessage((msg) => this.fanOut(msg));
  }

  private fanOut(msg: IncomingChatMessage): void {
    for (const l of this.listeners) {
      try { l(msg); } catch { /* swallow */ }
    }
  }

  detach(): void {
    this.internet.detach();
    this.bleAdapter?.detach();
    this.httpAdapter?.detach();
    this.currentUserId = null;
  }

  setForceEmergency(force: boolean): void {
    this.forceEmergency = force;
  }

  isForcingEmergency(): boolean {
    return this.forceEmergency;
  }

  /**
   * Walk the priority list and ask each transport `isAvailable()`. Returns
   * the first that says yes, or `null`.
   */
  async pickTransport(): Promise<ChatTransport | null> {
    const order = this.forceEmergency ? EMERGENCY_PRIORITY : DEFAULT_PRIORITY;
    for (const kind of order) {
      const transport = this.byKind(kind);
      if (!transport) continue;
      try {
        if (await transport.isAvailable()) return transport;
      } catch {
        // ignore individual probe errors
      }
    }
    return null;
  }

  /** Inspect the active priority list (read-only). */
  getPriority(): ChatTransportKind[] {
    return this.forceEmergency ? EMERGENCY_PRIORITY : DEFAULT_PRIORITY;
  }

  private byKind(kind: ChatTransportKind): ChatTransport | null {
    switch (kind) {
      case 'internet':
        return this.internet;
      case 'meshtastic-ble':
        return this.bleAdapter;
      case 'meshtastic-http':
        return this.httpAdapter;
      default:
        return null;
    }
  }

  /**
   * Try to send via each transport in priority order. Returns the outcome
   * (which transport carried it, optional id). If every transport fails,
   * the message is queued in `failedQueue` and an Error is thrown.
   */
  async send(message: OutgoingChatMessage): Promise<SendOutcome> {
    const order = this.forceEmergency ? EMERGENCY_PRIORITY : DEFAULT_PRIORITY;
    const attempted: ChatTransportKind[] = [];
    let lastError: string = 'No transport available.';

    for (const kind of order) {
      const transport = this.byKind(kind);
      if (!transport) continue;
      attempted.push(kind);

      try {
        if (!(await transport.isAvailable())) continue;
        const result = await transport.send(message);
        return { transport: kind, id: result?.id };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    this.failedQueue.push({
      message,
      attemptedTransports: attempted,
      lastError,
      failedAt: Date.now(),
    });
    throw new Error(`All transports failed: ${lastError}`);
  }

  /** Manual retry for messages that landed in the failed queue. */
  async retryFailed(): Promise<{ retried: number; recovered: number; remaining: number }> {
    const queue = this.failedQueue;
    this.failedQueue = [];
    let recovered = 0;

    for (const entry of queue) {
      try {
        await this.send(entry.message);
        recovered += 1;
      } catch {
        // already pushed back into failedQueue by send()
      }
    }
    return {
      retried: queue.length,
      recovered,
      remaining: this.failedQueue.length,
    };
  }

  getFailedQueue(): FailedSendEntry[] {
    return this.failedQueue.slice();
  }

  removeFailed(predicate: (entry: FailedSendEntry) => boolean): void {
    this.failedQueue = this.failedQueue.filter((entry) => !predicate(entry));
  }

  onMessage(handler: IncomingHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
}

/**
 * One shared TransportManager for the whole app. Created lazily so React
 * components and hooks can grab the same instance.
 */
let shared: TransportManager | null = null;

export function getTransportManager(): TransportManager {
  if (!shared) {
    shared = new TransportManager();
  }
  return shared;
}
