/**
 * Unified mesh transport interface — Phase 4.3
 *
 * Every concrete transport (BluetoothMeshTransport, HttpMeshTransport,
 * MultipeerTransport, etc.) implements this surface. The TransportManager
 * picks one based on availability and routes outbound messages through it,
 * surfacing inbound mesh packets back into the same chat UI as Supabase
 * messages.
 */

export type MeshTransportName = 'meshtastic-ble' | 'meshtastic-http' | 'multipeer';

export type MeshConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface MeshNodeInfo {
  /** Node number (uint32) */
  nodeNum?: number;
  /** Long human-readable name set on the device */
  longName?: string;
  /** Short 4-char id */
  shortName?: string;
  /** Firmware version string */
  firmwareVersion?: string;
  /** Hardware model name */
  hwModel?: string;
}

export interface MeshIncomingMessage {
  /** Source node number */
  fromNodeNum: number;
  /** Channel index */
  channel: number;
  /** UTF-8 text payload */
  text: string;
  /** Time the host received the packet */
  receivedAt: number;
}

export interface MeshTransport {
  /** Stable id, e.g. "meshtastic-ble". */
  readonly name: MeshTransportName;

  /** Quick check: can this transport even be used in the current environment? */
  isAvailable(): Promise<boolean>;

  /** Pair / open the connection. Throws on failure. */
  connect(): Promise<void>;

  /** Send a text message to a destination (default: broadcast). */
  sendText(text: string, destination?: number | 'broadcast', channel?: number): Promise<void>;

  /** Subscribe to incoming text packets. Returns an unsubscribe function. */
  onMessage(handler: (msg: MeshIncomingMessage) => void): () => void;

  /** Subscribe to connection-state changes. Returns an unsubscribe function. */
  onState(handler: (state: MeshConnectionState, info?: MeshNodeInfo) => void): () => void;

  /** Current node info (populated after connect / configure). */
  getNodeInfo(): MeshNodeInfo | null;

  /** Current state. */
  getState(): MeshConnectionState;

  /** Disconnect cleanly. */
  disconnect(): Promise<void>;
}
