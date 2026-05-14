/**
 * IndexedDB-backed local message store.
 *
 * Phase 2.1 / 2.2 / 2.9 — Mesh Guardian
 *
 * Three object stores:
 *  - messages: every received or sent message, keyed by id (server UUID OR
 *    client temp id). Each row carries `pending` so the outbox knows what to
 *    sync, and `clientTempId` so the optimistic row can be reconciled with
 *    the real Supabase row on insert.
 *  - outbox: write-ahead queue of messages waiting to be sent. Stored as
 *    {id, senderId, recipientId, roomId, body, transport, queuedAt, attempts}
 *  - metadata: scalar key/value pairs (last sync cursor per peer, schema
 *    version, etc.).
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { MessageStatus, Transport } from './realtimeChat';

const DB_NAME = 'mesh-guardian';
const DB_VERSION = 1;

export interface StoredMessage {
  id: string;
  clientTempId?: string;
  senderId: string;
  recipientId: string | null;
  roomId: string | null;
  body: string;
  createdAt: string; // ISO
  deliveredAt: string | null;
  readAt: string | null;
  transport: Transport;
  status: MessageStatus;
  pending: 0 | 1; // index requires int (IDB doesn't index booleans cleanly)
}

export interface OutboxEntry {
  id: string; // matches StoredMessage.id (the temp UUID)
  senderId: string;
  recipientId: string | null;
  roomId: string | null;
  body: string;
  transport: Transport;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

interface MeshGuardianDB extends DBSchema {
  messages: {
    key: string;
    value: StoredMessage;
    indexes: {
      'by-thread': string; // composite: `dm:{minId}:{maxId}` or `room:{roomId}`
      'by-pending': number; // 0 or 1
      'by-created': string; // ISO timestamp
    };
  };
  outbox: {
    key: string;
    value: OutboxEntry;
    indexes: {
      'by-queued': number;
    };
  };
  metadata: {
    key: string;
    value: MetaRow;
  };
}

let dbPromise: Promise<IDBPDatabase<MeshGuardianDB>> | null = null;

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function getDB(): Promise<IDBPDatabase<MeshGuardianDB>> {
  if (!isAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (!dbPromise) {
    dbPromise = openDB<MeshGuardianDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
          messagesStore.createIndex('by-thread', 'roomId');
          messagesStore.createIndex('by-pending', 'pending');
          messagesStore.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('by-queued', 'queuedAt');
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/** Build the thread key used by the by-thread index. */
export function threadKey(opts: {
  roomId?: string | null;
  userId?: string;
  recipientId?: string;
}): string {
  if (opts.roomId) return `room:${opts.roomId}`;
  const a = opts.userId ?? '';
  const b = opts.recipientId ?? '';
  const [low, high] = [a, b].sort();
  return `dm:${low}:${high}`;
}

/** Upsert one or more messages. */
export async function saveMessages(rows: StoredMessage[]): Promise<void> {
  if (!isAvailable() || rows.length === 0) return;
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  for (const row of rows) {
    await tx.store.put(row);
  }
  await tx.done;
}

/** Load all messages for a 1-on-1 thread, oldest first. */
export async function loadDirectThread(
  userId: string,
  recipientId: string,
): Promise<StoredMessage[]> {
  if (!isAvailable()) return [];
  const db = await getDB();
  const all = await db.getAll('messages');
  return all
    .filter(
      (m) =>
        !m.roomId &&
        ((m.senderId === userId && m.recipientId === recipientId) ||
          (m.senderId === recipientId && m.recipientId === userId)),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Load all messages for a room, oldest first. */
export async function loadRoomThread(roomId: string): Promise<StoredMessage[]> {
  if (!isAvailable()) return [];
  const db = await getDB();
  const all = await db.getAll('messages');
  return all
    .filter((m) => m.roomId === roomId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Reconcile an optimistic row with the canonical server row:
 *  - looks up by clientTempId if present
 *  - falls back to matching senderId+createdAt+body
 *  - removes the temp row and writes the canonical row
 */
export async function reconcileServerRow(
  serverRow: StoredMessage,
): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  const all = await tx.store.getAll();

  let toDelete: string | null = null;
  if (serverRow.clientTempId) {
    const match = all.find((m) => m.clientTempId === serverRow.clientTempId && m.id !== serverRow.id);
    if (match) toDelete = match.id;
  }
  if (!toDelete) {
    const match = all.find(
      (m) =>
        m.id !== serverRow.id &&
        m.pending === 1 &&
        m.senderId === serverRow.senderId &&
        m.body === serverRow.body &&
        Math.abs(new Date(m.createdAt).getTime() - new Date(serverRow.createdAt).getTime()) < 60_000,
    );
    if (match) toDelete = match.id;
  }

  if (toDelete) {
    await tx.store.delete(toDelete);
  }
  await tx.store.put(serverRow);
  await tx.done;
}

/** Add a row to the outbox. */
export async function enqueueOutbox(entry: OutboxEntry): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  await db.put('outbox', entry);
}

/** Remove a row from the outbox once it's been successfully synced. */
export async function dequeueOutbox(id: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  await db.delete('outbox', id);
}

/** List all outbox entries, oldest first. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  if (!isAvailable()) return [];
  const db = await getDB();
  const tx = db.transaction('outbox', 'readonly');
  const index = tx.store.index('by-queued');
  return index.getAll();
}

/** Update the attempt count + last error on an outbox entry. */
export async function markOutboxAttempt(
  id: string,
  options: { error?: string } = {},
): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  const tx = db.transaction('outbox', 'readwrite');
  const entry = await tx.store.get(id);
  if (entry) {
    entry.attempts = (entry.attempts ?? 0) + 1;
    if (options.error) entry.lastError = options.error;
    await tx.store.put(entry);
  }
  await tx.done;
}

/** Read a metadata key. */
export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  if (!isAvailable()) return undefined;
  const db = await getDB();
  const row = await db.get('metadata', key);
  return row?.value as T | undefined;
}

/** Write a metadata key. */
export async function setMeta(key: string, value: unknown): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  await db.put('metadata', { key, value, updatedAt: Date.now() });
}

/** For development / sign-out: clear everything. */
export async function clearAll(): Promise<void> {
  if (!isAvailable()) return;
  const db = await getDB();
  const tx = db.transaction(['messages', 'outbox', 'metadata'], 'readwrite');
  await Promise.all([
    tx.objectStore('messages').clear(),
    tx.objectStore('outbox').clear(),
    tx.objectStore('metadata').clear(),
  ]);
  await tx.done;
}

export const messageStoreAvailable = isAvailable;
