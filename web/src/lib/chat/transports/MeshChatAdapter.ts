/**
 * Adapt the low-level MeshTransport (BLE / HTTP) to the higher-level
 * ChatTransport surface so the TransportManager can route messages.
 *
 * Phase 6.3
 */

import type {
  ChatTransport,
  IncomingChatMessage,
  OutgoingChatMessage,
} from '../ChatTransport';
import { TRANSPORT_INFO } from '../ChatTransport';
import type { MeshTransport } from '../../mesh/transports/MeshTransport';

type IncomingHandler = (msg: IncomingChatMessage) => void;

/**
 * Wraps a MeshTransport (BLE or HTTP). Outgoing messages are broadcast over
 * the mesh; incoming text packets are normalized to IncomingChatMessage so
 * they appear in the same chat thread as Supabase messages.
 */
export class MeshChatAdapter implements ChatTransport {
  readonly info;
  private readonly mesh: MeshTransport;
  private listeners: Set<IncomingHandler> = new Set();
  private unsubscribe: (() => void) | null = null;

  constructor(mesh: MeshTransport) {
    this.mesh = mesh;
    this.info = TRANSPORT_INFO[mesh.name];
  }

  async isAvailable(): Promise<boolean> {
    if (!(await this.mesh.isAvailable())) return false;
    return this.mesh.getState() === 'connected';
  }

  async send(message: OutgoingChatMessage): Promise<void> {
    await this.mesh.sendText(message.body);
  }

  /**
   * Subscribe to incoming text packets. Called once by TransportManager.
   * Returns an unsubscribe.
   */
  attach(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.mesh.onMessage((msg) => {
      const normalized: IncomingChatMessage = {
        id: `mesh:${this.mesh.name}:${msg.fromNodeNum}:${msg.receivedAt}`,
        senderId: `mesh-node-${msg.fromNodeNum}`,
        body: msg.text,
        timestamp: msg.receivedAt,
        transportKind: this.mesh.name,
      };
      for (const l of this.listeners) {
        try { l(normalized); } catch { /* swallow */ }
      }
    });
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  onMessage(handler: IncomingHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
}
