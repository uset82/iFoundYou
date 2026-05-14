/**
 * Glue between the realtime chat layer and the offline IndexedDB store.
 *
 * Phase 2.3 / 2.4 / 2.7 / 2.8 — Mesh Guardian
 *
 * Responsibilities:
 *  - Convert ChatRow ↔ StoredMessage
 *  - Cache incoming server rows
 *  - Write a pending row + outbox entry on optimistic send
 *  - Reconcile pending rows when the server responds
 *  - Drain the outbox when connectivity returns
 */

import {
  enqueueOutbox,
  dequeueOutbox,
  listOutbox,
  markOutboxAttempt,
  reconcileServerRow,
  saveMessages,
} from './messageStore';
import type { StoredMessage, OutboxEntry } from './messageStore';
import {
  rowToStatus,
  sendMessage as sendRealtimeMessage,
} from './realtimeChat';
import type { ChatRow, MessageStatus, Transport } from './realtimeChat';

/** Convert a server-side ChatRow into a StoredMessage. */
export function rowToStored(row: ChatRow, viewerId: string): StoredMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    roomId: (row as any).room_id ?? null,
    body: row.body,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    transport: row.transport,
    status: rowToStatus(row, viewerId),
    pending: 0,
  };
}

/**
 * Convert a StoredMessage back into the shape ChatWindow expects.
 * Used when reading the cache.
 */
export interface ChatViewLite {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  timestamp: number;
  status: MessageStatus;
  transport: Transport;
}

export function storedToView(row: StoredMessage): ChatViewLite {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId ?? '',
    body: row.body,
    timestamp: new Date(row.createdAt).getTime(),
    status: row.status,
    transport: row.transport,
  };
}

/** Cache an incoming server row (used by subscribeThread callbacks). */
export async function cacheServerRow(row: ChatRow, viewerId: string): Promise<void> {
  try {
    await reconcileServerRow(rowToStored(row, viewerId));
  } catch {
    // Silently fail — IndexedDB unavailable or quota exceeded
  }
}

/**
 * Optimistically write a pending message + outbox entry, then attempt to
 * actually send. If the send succeeds, the outbox row is removed and the
 * canonical server row replaces the pending one. If it fails, the message
 * stays in the outbox to be retried.
 *
 * Returns the id under which the message was stored (server id on success,
 * temp id on failure).
 */
export async function sendWithOutbox(
  userId: string,
  recipientId: string,
  body: string,
  options: { transport?: Transport; roomId?: string | null } = {},
): Promise<{
  id: string;
  pending: boolean;
  serverRow?: ChatRow;
  error?: string;
}> {
  const transport = options.transport ?? 'internet';
  const roomId = options.roomId ?? null;
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const nowIso = new Date().toISOString();

  const optimistic: StoredMessage = {
    id: tempId,
    clientTempId: tempId,
    senderId: userId,
    recipientId: roomId ? null : recipientId,
    roomId,
    body,
    createdAt: nowIso,
    deliveredAt: null,
    readAt: null,
    transport,
    status: 'pending',
    pending: 1,
  };
  const outboxEntry: OutboxEntry = {
    id: tempId,
    senderId: userId,
    recipientId: roomId ? null : recipientId,
    roomId,
    body,
    transport,
    queuedAt: Date.now(),
    attempts: 0,
  };

  await Promise.all([
    saveMessages([optimistic]).catch(() => {}),
    enqueueOutbox(outboxEntry).catch(() => {}),
  ]);

  if (roomId) {
    // Room sends are handled by drainOutboxRoom below for symmetry.
    // Defer to the caller (GroupChatPanel) to actually deliver via sendRoomMessage.
    return { id: tempId, pending: true };
  }

  const result = await sendRealtimeMessage(userId, recipientId, body, transport);

  if (result.error || !result.row) {
    await markOutboxAttempt(tempId, { error: result.error }).catch(() => {});
    return { id: tempId, pending: true, error: result.error };
  }

  const serverRow = result.row;
  await Promise.all([
    cacheServerRow(serverRow, userId),
    dequeueOutbox(tempId),
  ]);

  return { id: serverRow.id, pending: false, serverRow };
}

/**
 * Walk every outbox entry and re-attempt to send. Called when the network
 * comes back online or when a manual Retry button is pressed.
 */
export async function drainOutbox(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const entries = await listOutbox();

  for (const entry of entries) {
    if (entry.roomId || !entry.recipientId) {
      // Room sends handled separately
      continue;
    }
    const result = await sendRealtimeMessage(
      entry.senderId,
      entry.recipientId,
      entry.body,
      entry.transport,
    );
    if (result.error || !result.row) {
      failed += 1;
      await markOutboxAttempt(entry.id, { error: result.error }).catch(() => {});
      continue;
    }
    await Promise.all([
      cacheServerRow(result.row, entry.senderId),
      dequeueOutbox(entry.id),
    ]);
    sent += 1;
  }

  return { sent, failed };
}

/** Reconcile a single server row produced by an optimistic send. */
export async function applyServerRowToOutbox(
  tempId: string,
  serverRow: ChatRow,
  viewerId: string,
): Promise<void> {
  await Promise.all([
    cacheServerRow(serverRow, viewerId),
    dequeueOutbox(tempId),
  ]);
}
