import { useEffect, useState } from 'react';

export type NetworkStatus = 'online' | 'offline' | 'emergency';

interface UseNetworkStatusOptions {
  /** Force emergency mode regardless of connectivity */
  forceEmergency?: boolean;
  /** Heartbeat URL to ping (HEAD request). If null, only browser online events are used. */
  heartbeatUrl?: string | null;
  /** Heartbeat interval in ms (default 30s). */
  heartbeatIntervalMs?: number;
}

/**
 * Tracks the network status with three states: online, offline, or emergency.
 * Listens to browser online/offline events and optionally performs heartbeat pings
 * to detect captive portals or "online but no real connectivity" states.
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}) {
  const { forceEmergency = false, heartbeatUrl = null, heartbeatIntervalMs = 30000 } = options;

  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [reachable, setReachable] = useState<boolean>(true);

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!heartbeatUrl) return;

    let cancelled = false;

    const ping = async () => {
      if (!navigator.onLine) {
        setReachable(false);
        return;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(heartbeatUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeout);
        if (!cancelled) setReachable(res.ok || res.type === 'opaque');
      } catch {
        if (!cancelled) setReachable(false);
      }
    };

    void ping();
    const id = setInterval(ping, heartbeatIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [heartbeatUrl, heartbeatIntervalMs]);

  let status: NetworkStatus;
  if (forceEmergency) {
    status = 'emergency';
  } else if (!browserOnline || !reachable) {
    status = 'offline';
  } else {
    status = 'online';
  }

  return { status, browserOnline, reachable };
}
