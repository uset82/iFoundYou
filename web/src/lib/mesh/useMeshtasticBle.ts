import { useCallback, useEffect, useState } from 'react';
import { BluetoothMeshTransport } from './transports/BluetoothMeshTransport';
import type {
  MeshConnectionState,
  MeshIncomingMessage,
  MeshNodeInfo,
} from './transports/MeshTransport';
import { supportsWebBluetooth } from '../chat/platform';

/**
 * Singleton-ish wrapper around `BluetoothMeshTransport`.
 *
 * The transport instance is created lazily and shared so multiple components
 * (Mesh view, status pill, chat composer) can subscribe to the same state.
 */

let sharedTransport: BluetoothMeshTransport | null = null;

function getOrCreateTransport(): BluetoothMeshTransport {
  if (!sharedTransport) {
    sharedTransport = new BluetoothMeshTransport();
  }
  return sharedTransport;
}

export interface UseMeshtasticBleResult {
  supported: boolean;
  state: MeshConnectionState;
  nodeInfo: MeshNodeInfo | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  /** Subscribe to incoming text messages from the mesh. */
  subscribeMessages: (handler: (msg: MeshIncomingMessage) => void) => () => void;
}

export function useMeshtasticBle(): UseMeshtasticBleResult {
  const supported = supportsWebBluetooth();
  const [state, setState] = useState<MeshConnectionState>(
    supported ? sharedTransport?.getState() ?? 'disconnected' : 'disconnected',
  );
  const [nodeInfo, setNodeInfo] = useState<MeshNodeInfo | null>(
    sharedTransport?.getNodeInfo() ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    const transport = getOrCreateTransport();
    const unsubscribe = transport.onState((nextState, info) => {
      setState(nextState);
      if (info) setNodeInfo(info);
    });
    return unsubscribe;
  }, [supported]);

  const connect = useCallback(async () => {
    if (!supported) {
      setError('Web Bluetooth is not supported in this browser.');
      return;
    }
    setError(null);
    const transport = getOrCreateTransport();
    try {
      await transport.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connect failed.';
      setError(message);
      throw err;
    }
  }, [supported]);

  const disconnect = useCallback(async () => {
    if (!sharedTransport) return;
    await sharedTransport.disconnect();
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!sharedTransport) throw new Error('Not connected to a Meshtastic device.');
    await sharedTransport.sendText(text);
  }, []);

  const subscribeMessages = useCallback(
    (handler: (msg: MeshIncomingMessage) => void) => {
      const transport = getOrCreateTransport();
      return transport.onMessage(handler);
    },
    [],
  );

  return { supported, state, nodeInfo, error, connect, disconnect, sendText, subscribeMessages };
}
