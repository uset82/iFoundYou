import { useCallback, useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../supabase';

/**
 * Loads the current user's blocked-users list and exposes block / unblock /
 * report helpers. Used by the Discover view to hide bad actors.
 */
export function useBlockedUsers(userId: string | null | undefined) {
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !hasSupabaseConfig) {
      setBlockedIds(new Set());
      return;
    }
    const { data, error: fetchError } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('user_id', userId);
    if (fetchError) {
      setError(fetchError.message);
      return;
    }
    setBlockedIds(new Set((data ?? []).map((row) => row.blocked_id as string)));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const block = useCallback(
    async (peerId: string, opts: { reason?: string; report?: boolean } = {}) => {
      if (!userId || !hasSupabaseConfig) return;
      setBusyId(peerId);
      setError(null);
      const { error: insertError } = await supabase.from('blocked_users').upsert(
        {
          user_id: userId,
          blocked_id: peerId,
          reason: opts.reason ?? null,
          reported: opts.report === true,
        },
        { onConflict: 'user_id,blocked_id' },
      );
      if (insertError) {
        setError(insertError.message);
      } else {
        setBlockedIds((prev) => {
          const next = new Set(prev);
          next.add(peerId);
          return next;
        });
      }
      setBusyId(null);
    },
    [userId],
  );

  const unblock = useCallback(
    async (peerId: string) => {
      if (!userId || !hasSupabaseConfig) return;
      setBusyId(peerId);
      setError(null);
      const { error: deleteError } = await supabase
        .from('blocked_users')
        .delete()
        .eq('user_id', userId)
        .eq('blocked_id', peerId);
      if (deleteError) {
        setError(deleteError.message);
      } else {
        setBlockedIds((prev) => {
          const next = new Set(prev);
          next.delete(peerId);
          return next;
        });
      }
      setBusyId(null);
    },
    [userId],
  );

  const isBlocked = useCallback((peerId: string) => blockedIds.has(peerId), [blockedIds]);

  return { blockedIds, isBlocked, block, unblock, busyId, error, refresh };
}
