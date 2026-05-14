/**
 * Unified ChatTransport interface — Phase 6.1
 *
 * The chat layer can deliver messages over many physical transports:
 * Supabase Realtime (internet), Meshtastic Bluetooth, Meshtastic HTTP/Wi-Fi,
 * Apple Multipeer Connectivity (iOS native), etc. They all share a tiny
 * common surface so the TransportManager can route a single message through
 * whichever one is available, with fail-over.
 */

export type ChatTransportKind =
  | 'internet'
  | 'meshtastic-ble'
  | 'meshtastic-http'
  | 'multipeer';

export interface ChatTransportInfo {
  /** Stable identifier */
  kind: ChatTransportKind;
  /** Friendly label for the UI ("🌐 Internet", "📡 Mesh-BT", …) */
  label: string;
  /** Compact icon for chips and toolbars */
  icon: string;
}

export interface OutgoingChatMessage {
  /** Sender user id */
  senderId: string;
  /** Recipient user id (`null` when broadcasting via mesh / multipeer) */
  recipientId: string | null;
  /** Optional room id (group chat) */
  roomId?: string | null;
  /** Free-form message body — may already be `EWS|...` encoded for emergencies */
  body: string;
}

export interface IncomingChatMessage {
  /** Stable id (server uuid for internet messages, synthetic for mesh) */
  id: string;
  senderId: string;
  recipientId?: string | null;
  roomId?: string | null;
  body: string;
  timestamp: number;
  transportKind: ChatTransportKind;
}

export interface ChatTransport {
  readonly info: ChatTransportInfo;

  /** Quick check — environment + state both reachable? */
  isAvailable(): Promise<boolean>;

  /** Send a message. Throws on failure so the manager can fall over. */
  send(message: OutgoingChatMessage): Promise<{ id: string } | void>;

  /** Subscribe to incoming messages from this transport. */
  onMessage(handler: (msg: IncomingChatMessage) => void): () => void;
}

export const TRANSPORT_INFO: Record<ChatTransportKind, ChatTransportInfo> = {
  internet: { kind: 'internet', label: 'Internet', icon: '🌐' },
  'meshtastic-ble': { kind: 'meshtastic-ble', label: 'Mesh-BT', icon: '📡' },
  'meshtastic-http': { kind: 'meshtastic-http', label: 'Mesh-WiFi', icon: '📡' },
  multipeer: { kind: 'multipeer', label: 'Multipeer', icon: '📲' },
};
