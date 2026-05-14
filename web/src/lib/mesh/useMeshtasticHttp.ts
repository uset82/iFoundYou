import { useCallback, useEffect, useState } from 'react';
import { HttpMeshTransport } from './transports/HttpMeshTransport';
import type { HttpMeshConfig } from './transports/HttpMeshTransport';
import type {
  MeshConnectionState,
  MeshIncomingMessage,
  MeshNodeInfo,
} from './transports/MeshTransport';
import { getTransportManager } from '../chat/TransportManager';

const STORAGE_KEY = 'ify:meshtastic-http-config';

let sharedTransport: HttpMeshTransport | null = null;

function getOrCreateTransport(): HttpMeshTransport {
  if (!sharedTransport) {
    sharedTransport = new HttpMeshTransport();
    getTransportManager().registerHttp(sharedTransport);
  }
  return sharedTransport;
}

function loadStoredConfig(): HttpMeshConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.address === 'string' && parsed.address) {
      return { address: parsed.address, tls: Boolean(parsed.tls) };
    }
  } catch {
    // ignore
  }
  return null;
}

function persistConfig(config: HttpMeshConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

export interface UseMeshtasticHttpResult {
  state: MeshConnectionState;
  nodeInfo: MeshNodeInfo | null;
  error: string | null;
  config: HttpMeshConfig | null;
  setConfig: (config: HttpMeshConfig) => void;
  connect: (config: HttpMeshConfig) => Promise<void>;
  disconnect: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  subscribeMessages: (handler: (msg: MeshIncomingMessage) => void) => () => void;
}

export function useMeshtasticHttp(): UseMeshtasticHttpResult {
  const [state, setState] = useState<MeshConnectionState>(
    sharedTransport?.getState() ?? 'disconnected',
  );
  const [nodeInfo, setNodeInfo] = useState<MeshNodeInfo | null>(
    sharedTransport?.getNodeInfo() ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [config, setConfigState] = useState<HttpMeshConfig | null>(loadStoredConfig);

  useEffect(() => {
    const transport = getOrCreateTransport();
    const unsubscribe = transport.onState((nextState, info) => {
      setState(nextState);
      if (info) setNodeInfo(info);
    });
    return unsubscribe;
  }, []);

  const setConfig = useCallback((next: HttpMeshConfig) => {
    setConfigState(next);
    persistConfig(next);
    getOrCreateTransport().setConfig(next);
  }, []);

  const connect = useCallback(
    async (next: HttpMeshConfig) => {
      setError(null);
      setConfig(next);
      try {
        await getOrCreateTransport().connectWithConfig(next);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'HTTP connect failed.';
        setError(message);
        throw err;
      }
    },
    [setConfig],
  );

  const disconnect = useCallback(async () => {
    if (!sharedTransport) return;
    await sharedTransport.disconnect();
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!sharedTransport) throw new Error('Not connected to a Meshtastic node.');
    await sharedTransport.sendText(text);
  }, []);

  const subscribeMessages = useCallback(
    (handler: (msg: MeshIncomingMessage) => void) => {
      const transport = getOrCreateTransport();
      return transport.onMessage(handler);
    },
    [],
  );

  return {
    state,
    nodeInfo,
    error,
    config,
    setConfig,
    connect,
    disconnect,
    sendText,
    subscribeMessages,
  };
}
