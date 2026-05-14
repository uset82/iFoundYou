import { useCallback, useEffect, useRef, useState } from 'react';
import { drainOutbox } from './offlineSync';
import { listOutbox } from './messageStore';

interface OutboxSyncState {
  pendingCount: number;
  syncing: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

/**
 * Watches the browser network status and the outbox. When the connection
 * comes back online, drain the outbox automatically. Also exposes a manual
 * `sync()` trigger and the current pending count for UI badges.
 *
 * Phase 2.8 / 2.9 — Mesh Guardian
 */
export function useOutboxSync() {
  const [state, setState] = useState<OutboxSyncState>({
    pendingCount: 0,
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
  });
  const draining = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const entries = await listOutbox();
      setState((prev) => ({ ...prev, pendingCount: entries.length }));
    } catch {
      // ignore
    }
  }, []);

  const sync = useCallback(async () => {
    if (draining.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    draining.current = true;
    setState((prev) => ({ ...prev, syncing: true, lastError: null }));
    try {
      const result = await drainOutbox();
      const remaining = await listOutbox();
      setState({
        pendingCount: remaining.length,
        syncing: false,
        lastSyncedAt: Date.now(),
        lastError: result.failed > 0 ? `${result.failed} message(s) still queued` : null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        syncing: false,
        lastError: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      draining.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshCount();

    const handleOnline = () => {
      void sync();
    };
    window.addEventListener('online', handleOnline);

    // Drain once on mount in case the app was reloaded while online but with
    // leftover outbox rows from a previous session.
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void sync();
    }

    // Refresh count periodically while the app is open
    const interval = window.setInterval(() => {
      void refreshCount();
    }, 15_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(interval);
    };
  }, [refreshCount, sync]);

  return { ...state, sync, refreshCount };
}
