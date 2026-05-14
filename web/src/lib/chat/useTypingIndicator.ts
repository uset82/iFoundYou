import { useEffect, useRef, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../supabase';

const TYPING_TIMEOUT_MS = 3000;

/**
 * Coordinates typing indicators between two users via Supabase Realtime broadcast.
 *
 * Returns:
 *  - isPeerTyping: true when the recipient is currently typing
 *  - notifyTyping(): call when the local user types something
 */
export function useTypingIndicator(userId: string | null, recipientId: string | null) {
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef<number>(0);
  const peerTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig || !userId || !recipientId) return;

    // Build a stable channel name for this 1-to-1 thread
    const ids = [userId, recipientId].sort();
    const topic = `typing:${ids[0]}:${ids[1]}`;

    const channel = supabase
      .channel(topic, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const fromId = (payload.payload as any)?.userId;
        if (fromId === recipientId) {
          setIsPeerTyping(true);
          if (peerTypingTimerRef.current) {
            clearTimeout(peerTypingTimerRef.current);
          }
          peerTypingTimerRef.current = setTimeout(() => {
            setIsPeerTyping(false);
          }, TYPING_TIMEOUT_MS);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (peerTypingTimerRef.current) {
        clearTimeout(peerTypingTimerRef.current);
      }
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setIsPeerTyping(false);
    };
  }, [userId, recipientId]);

  const notifyTyping = () => {
    const now = Date.now();
    // Throttle to one ping per second
    if (now - lastSentRef.current < 1000) return;
    lastSentRef.current = now;

    const channel = channelRef.current;
    if (!channel) return;

    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId },
    });
  };

  return { isPeerTyping, notifyTyping };
}
