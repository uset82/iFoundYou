import { useCallback, useEffect, useState } from 'react';
import { getTransportManager } from './TransportManager';
import type { ChatTransportKind } from './ChatTransport';
import { useNetworkStatus } from './useNetworkStatus';
import { useMeshtasticBle } from '../mesh/useMeshtasticBle';
import { useMeshtasticHttp } from '../mesh/useMeshtasticHttp';

export interface UseTransportManagerResult {
  /** The transport that the manager would pick right now. */
  activeTransport: ChatTransportKind | null;
  /** Whether the user has manually forced Emergency Mode. */
  forcingEmergency: boolean;
  /** Toggle force-emergency. When on, mesh transports are tried before internet. */
  setForceEmergency: (force: boolean) => void;
  /** Number of messages stuck in the failed queue. */
  failedCount: number;
  /** Manual retry. */
  retryFailed: () => Promise<void>;
}

/**
 * Subscribes to network status + mesh transport state and reports which
 * transport the TransportManager would pick right now. Also exposes a
 * Force Emergency Mode toggle and a Retry-failed helper.
 */
export function useTransportManager(): UseTransportManagerResult {
  const manager = getTransportManager();
  const network = useNetworkStatus();
  const ble = useMeshtasticBle();
  const http = useMeshtasticHttp();

  const [activeTransport, setActiveTransport] = useState<ChatTransportKind | null>(null);
  const [forcingEmergency, setForcing] = useState(manager.isForcingEmergency());
  const [failedCount, setFailedCount] = useState(manager.getFailedQueue().length);

  // Re-pick whenever any input flips: online/offline, BLE state, HTTP state, force toggle
  useEffect(() => {
    let cancelled = false;
    void manager.pickTransport().then((t) => {
      if (!cancelled) setActiveTransport(t?.info.kind ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [manager, network.status, ble.state, http.state, forcingEmergency]);

  // Refresh failed-count periodically
  useEffect(() => {
    const id = window.setInterval(() => {
      setFailedCount(manager.getFailedQueue().length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [manager]);

  const setForceEmergency = useCallback(
    (force: boolean) => {
      manager.setForceEmergency(force);
      setForcing(force);
    },
    [manager],
  );

  const retryFailed = useCallback(async () => {
    await manager.retryFailed();
    setFailedCount(manager.getFailedQueue().length);
  }, [manager]);

  return {
    activeTransport,
    forcingEmergency,
    setForceEmergency,
    failedCount,
    retryFailed,
  };
}
