/**
 * Internet transport — Phase 6.2
 *
 * Wraps Supabase Realtime via the realtimeChat helpers so the
 * TransportManager can hand off messages to the canonical online path.
 */

import { hasSupabaseConfig, supabase } from '../../supabase';
import { sendMessage as sendRealtimeMessage } from '../realtimeChat';
import type {
  ChatTransport,
  IncomingChatMessage,
  OutgoingChatMessage,
} from '../ChatTransport';
import { TRANSPORT_INFO } from '../ChatTransport';

const HEARTBEAT_TIMEOUT_MS = 4000;

type IncomingHandler = (msg: IncomingChatMessage) => void;

export class InternetTransport implements ChatTransport {
  readonly info = TRANSPORT_INFO.internet;
  private listeners: Set<IncomingHandler> = new Set();
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private subscribedForUserId: string | null = null;

  async isAvailable(): Promise<boolean> {
    if (!hasSupabaseConfig) return false;
    if (typeof navigator === 'undefined') return true;
    if (navigator.onLine === false) return false;

    // Quick reachability probe to detect captive portals
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
      const res = await fetch(`${(import.meta as any).env?.VITE_SUPABASE_URL ?? ''}/auth/v1/health`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      // no-cors returns opaque, so just check we didn't throw
      return res.type === 'opaque' || res.ok;
    } catch {
      return false;
    }
  }

  async send(message: OutgoingChatMessage): Promise<{ id: string }> {
    if (!message.recipientId && !message.roomId) {
      throw new Error('InternetTransport requires either recipientId or roomId.');
    }
    if (message.roomId) {
      // Group send — handled separately by GroupChatPanel today.
      throw new Error('InternetTransport.send: room sends not routed here yet.');
    }
    const result = await sendRealtimeMessage(
      message.senderId,
      message.recipientId!,
      message.body,
      'internet',
    );
    if (result.error || !result.row) {
      throw new Error(result.error ?? 'Send failed.');
    }
    return { id: result.row.id };
  }

  /**
   * Subscribe to ALL incoming messages for the given user id. The
   * TransportManager calls this once per session.
   */
  attach(userId: string): void {
    if (this.subscribedForUserId === userId && this.channel) return;
    this.detach();

    this.subscribedForUserId = userId;
    this.channel = supabase
      .channel(`chat-transport:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          const msg: IncomingChatMessage = {
            id: row.id,
            senderId: row.sender_id,
            recipientId: row.recipient_id,
            roomId: row.room_id ?? null,
            body: row.body,
            timestamp: new Date(row.created_at).getTime(),
            transportKind: 'internet',
          };
          for (const l of this.listeners) {
            try { l(msg); } catch { /* swallow */ }
          }
        },
      )
      .subscribe();
  }

  detach(): void {
    if (this.channel) {
      void supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.subscribedForUserId = null;
  }

  onMessage(handler: IncomingHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
}
