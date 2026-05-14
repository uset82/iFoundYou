import { useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../supabase';

const STORAGE_KEY = 'ify:read-cursors';

type ReadCursors = Record<string, string>; // peerId -> ISO timestamp of last read

function loadCursors(): ReadCursors {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCursors(cursors: ReadCursors): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cursors));
  } catch {
    // Storage might be full or restricted in private mode
  }
}

/**
 * Tracks unread message counts per peer for the current user.
 *
 * Uses localStorage to remember when each conversation was last "read",
 * then counts incoming messages from each peer with created_at > read cursor.
 *
 * @param userId  Current user's ID
 * @param peerIds  Peer IDs to track unread counts for
 * @param activePeerId  The peer whose chat is currently open (auto-marks as read)
 */
export function useUnreadCounts(
  userId: string | null | undefined,
  peerIds: string[],
  activePeerId: string | null = null,
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursors, setCursors] = useState<ReadCursors>(() => loadCursors());

  // When the active chat changes, mark it as read (move cursor to now)
  useEffect(() => {
    if (!activePeerId) return;
    setCursors((prev) => {
      const next = { ...prev, [activePeerId]: new Date().toISOString() };
      saveCursors(next);
      return next;
    });
    setCounts((prev) => ({ ...prev, [activePeerId]: 0 }));
  }, [activePeerId]);

  // Fetch initial unread counts when peer list or user changes
  useEffect(() => {
    if (!userId || !hasSupabaseConfig || peerIds.length === 0) {
      setCounts({});
      return;
    }

    let cancelled = false;

    const fetchCounts = async () => {
      const next: Record<string, number> = {};
      for (const peerId of peerIds) {
        if (peerId === activePeerId) {
          next[peerId] = 0;
          continue;
        }
        const cursor = cursors[peerId] ?? new Date(0).toISOString();
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_id', peerId)
          .eq('recipient_id', userId)
          .gt('created_at', cursor);
        if (error) continue;
        next[peerId] = count ?? 0;
      }
      if (!cancelled) setCounts(next);
    };

    void fetchCounts();

    return () => {
      cancelled = true;
    };
  }, [userId, peerIds.join(','), activePeerId]); // depend on stable string

  // Live increment on incoming messages
  useEffect(() => {
    if (!userId || !hasSupabaseConfig) return;

    const channel = supabase
      .channel(`unread-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: any) => {
          const senderId = payload.new?.sender_id;
          if (!senderId || senderId === activePeerId) return;
          setCounts((prev) => ({ ...prev, [senderId]: (prev[senderId] ?? 0) + 1 }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, activePeerId]);

  const markAsRead = (peerId: string) => {
    setCursors((prev) => {
      const next = { ...prev, [peerId]: new Date().toISOString() };
      saveCursors(next);
      return next;
    });
    setCounts((prev) => ({ ...prev, [peerId]: 0 }));
  };

  return { counts, markAsRead };
}
