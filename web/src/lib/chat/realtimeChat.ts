/**
 * Realtime chat service — Supabase Realtime + REST wrapper.
 *
 * One-stop helper for ChatWindow: load a thread, subscribe to inserts /
 * updates, send a message, and mark messages as delivered / read.
 *
 * Phase 1.3 — Mesh Guardian
 */

import { hasSupabaseConfig, supabase } from '../supabase';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';

export type Transport = 'internet' | 'mesh-bt' | 'mesh-http' | 'multipeer';

export interface ChatRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  transport: Transport;
}

export interface ChatMessageView {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  timestamp: number;
  status: MessageStatus;
  transport: Transport;
}

export interface SubscribeOptions {
  userId: string;
  recipientId: string;
  onInsert: (row: ChatRow) => void;
  onUpdate?: (row: ChatRow) => void;
}

const SELECT_COLUMNS =
  'id, sender_id, recipient_id, body, created_at, delivered_at, read_at, transport';

/** Maps a raw row to the chat status used by the UI. */
export function rowToStatus(row: ChatRow, viewerId: string): MessageStatus {
  // Status is from the sender's POV. If the viewer is the recipient, treat as read.
  if (row.sender_id === viewerId) {
    if (row.read_at) return 'read';
    if (row.delivered_at) return 'delivered';
    return 'sent';
  }
  return row.read_at ? 'read' : 'delivered';
}

export function rowToView(row: ChatRow, viewerId: string): ChatMessageView {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    timestamp: new Date(row.created_at).getTime(),
    status: rowToStatus(row, viewerId),
    transport: row.transport,
  };
}

/** Load all messages between two users, oldest first. */
export async function loadThread(userId: string, recipientId: string): Promise<ChatRow[]> {
  if (!hasSupabaseConfig) return [];
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT_COLUMNS)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`,
    )
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as ChatRow[];
}

/** Send a message and return the inserted row. */
export async function sendMessage(
  userId: string,
  recipientId: string,
  body: string,
  transport: Transport = 'internet',
): Promise<{ row?: ChatRow; error?: string }> {
  if (!hasSupabaseConfig) return { error: 'Supabase config missing.' };
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: userId, recipient_id: recipientId, body, transport })
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) return { error: error?.message ?? 'Send failed.' };
  return { row: data as ChatRow };
}

/** Mark received messages as delivered for the given peer thread. */
export async function markDelivered(userId: string, fromId: string): Promise<void> {
  if (!hasSupabaseConfig) return;
  await supabase
    .from('messages')
    .update({ delivered_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('sender_id', fromId)
    .is('delivered_at', null);
}

/** Mark received messages as read for the given peer thread. */
export async function markRead(userId: string, fromId: string): Promise<void> {
  if (!hasSupabaseConfig) return;
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('sender_id', fromId)
    .is('read_at', null);
}

/**
 * Subscribe to message inserts + updates for a 1-on-1 thread.
 * Returns a cleanup function.
 */
export function subscribeThread(opts: SubscribeOptions): () => void {
  if (!hasSupabaseConfig) return () => {};

  const { userId, recipientId, onInsert, onUpdate } = opts;
  const matchesThread = (row: any) =>
    (row.sender_id === userId && row.recipient_id === recipientId) ||
    (row.sender_id === recipientId && row.recipient_id === userId);

  const channelName = `messages:${[userId, recipientId].sort().join(':')}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload: any) => {
        const row = payload.new as ChatRow;
        if (row && matchesThread(row)) onInsert(row);
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload: any) => {
        const row = payload.new as ChatRow;
        if (row && matchesThread(row) && onUpdate) onUpdate(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
