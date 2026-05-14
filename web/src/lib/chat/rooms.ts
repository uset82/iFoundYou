/**
 * Group chat rooms — Supabase wrapper for chat_rooms + chat_room_members.
 *
 * Phase 1.7 — Mesh Guardian
 */

import { hasSupabaseConfig, supabase } from '../supabase';
import type { ChatRow, MessageStatus, Transport } from './realtimeChat';
import { rowToStatus } from './realtimeChat';

export interface ChatRoom {
  id: string;
  name: string;
  type: string;
  psk: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ChatRoomMember {
  roomId: string;
  userId: string;
  role: string;
  joinedAt: string;
}

export interface RoomMessageView {
  id: string;
  roomId: string;
  senderId: string;
  body: string;
  timestamp: number;
  status: MessageStatus;
  transport: Transport;
}

const ROOM_SELECT = 'id, name, type, psk, created_by, created_at';

function rowToRoom(row: any): ChatRoom {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? 'internet',
    psk: row.psk ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** List the rooms the current user belongs to. */
export async function listRooms(userId: string): Promise<ChatRoom[]> {
  if (!hasSupabaseConfig || !userId) return [];
  const { data: memberRows, error: memberErr } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId);
  if (memberErr || !memberRows || memberRows.length === 0) return [];

  const roomIds = memberRows.map((r) => r.room_id as string);
  const { data, error } = await supabase
    .from('chat_rooms')
    .select(ROOM_SELECT)
    .in('id', roomIds)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(rowToRoom);
}

/**
 * Create a room and add all the requested members (plus the creator).
 * Returns the new room or an error message.
 */
export async function createRoom(
  creatorId: string,
  name: string,
  inviteeIds: string[],
  type: string = 'internet',
  psk: string | null = null,
): Promise<{ room?: ChatRoom; error?: string }> {
  if (!hasSupabaseConfig) return { error: 'Supabase config missing.' };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: 'Room name is required.' };

  const { data: roomRow, error: roomErr } = await supabase
    .from('chat_rooms')
    .insert({ name: trimmedName, created_by: creatorId, type, psk })
    .select(ROOM_SELECT)
    .single();
  if (roomErr || !roomRow) return { error: roomErr?.message ?? 'Could not create room.' };

  const memberIds = Array.from(new Set([creatorId, ...inviteeIds]));
  const memberRows = memberIds.map((uid) => ({
    room_id: roomRow.id,
    user_id: uid,
    role: uid === creatorId ? 'owner' : 'member',
  }));

  const { error: memberErr } = await supabase.from('chat_room_members').insert(memberRows);
  if (memberErr) {
    return {
      error: `Room created but couldn't add members: ${memberErr.message}`,
      room: rowToRoom(roomRow),
    };
  }

  return { room: rowToRoom(roomRow) };
}

/**
 * Join an existing mesh channel using a PSK.
 * If the room doesn't exist locally (from an offline QR code), this will attempt to upsert it
 * if we allow that, but typically the room must exist on the Supabase side for online sync.
 * For offline-only mesh channels, we might rely entirely on local state, but the current design
 * syncs channels via Supabase when online.
 */
export async function joinRoomWithPsk(
  userId: string,
  roomId: string,
  psk: string,
  name: string,
  type: string
): Promise<{ error?: string; room?: ChatRoom }> {
  if (!hasSupabaseConfig) return { error: 'Supabase config missing.' };

  // Note: if the user is offline, we'd need to insert this into an offline queue or idb.
  // For MVP, we insert via Supabase and assume they are online, or it fails.
  const { data: roomRow, error: roomErr } = await supabase
    .from('chat_rooms')
    .upsert({ id: roomId, name, psk, type, created_by: userId }, { onConflict: 'id' })
    .select(ROOM_SELECT)
    .single();

  if (roomErr || !roomRow) return { error: roomErr?.message ?? 'Could not join channel.' };

  const { error: memberErr } = await supabase
    .from('chat_room_members')
    .upsert({ room_id: roomId, user_id: userId, role: 'member' }, { onConflict: 'room_id,user_id' });

  if (memberErr) return { error: memberErr.message };

  return { room: rowToRoom(roomRow) };
}

/** Members of a given room (with display names from profiles). */
export async function listRoomMembers(roomId: string): Promise<
  Array<{ userId: string; displayName: string }>
> {
  if (!hasSupabaseConfig || !roomId) return [];
  const { data: members, error: memberErr } = await supabase
    .from('chat_room_members')
    .select('user_id')
    .eq('room_id', roomId);
  if (memberErr || !members || members.length === 0) return [];

  const ids = members.map((m) => m.user_id as string);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);

  const profileMap = new Map<string, string>();
  (profiles ?? []).forEach((p: any) => {
    profileMap.set(p.id, p.display_name ?? 'Friend');
  });

  return ids.map((id) => ({
    userId: id,
    displayName: profileMap.get(id) ?? 'Friend',
  }));
}

/** Leave a room (delete own membership). Owner cannot leave their own room here. */
export async function leaveRoom(userId: string, roomId: string): Promise<{ error?: string }> {
  if (!hasSupabaseConfig) return { error: 'Supabase config missing.' };
  const { error } = await supabase
    .from('chat_room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return {};
}

/** Load a room thread (oldest first). */
export async function loadRoomThread(roomId: string): Promise<ChatRow[]> {
  if (!hasSupabaseConfig || !roomId) return [];
  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, sender_id, recipient_id, body, created_at, delivered_at, read_at, transport, room_id',
    )
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as ChatRow[];
}

/** Send a message to a room. recipient_id is set to the sender's own id (placeholder). */
export async function sendRoomMessage(
  senderId: string,
  roomId: string,
  body: string,
  transport: Transport = 'internet',
): Promise<{ row?: ChatRow; error?: string }> {
  if (!hasSupabaseConfig) return { error: 'Supabase config missing.' };
  const trimmed = body.trim();
  if (!trimmed) return { error: 'Empty message.' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      recipient_id: senderId, // self — required by NOT NULL; constraint allows when room_id is set
      body: trimmed,
      transport,
      room_id: roomId,
    })
    .select(
      'id, sender_id, recipient_id, body, created_at, delivered_at, read_at, transport, room_id',
    )
    .single();
  if (error || !data) return { error: error?.message ?? 'Send failed.' };
  return { row: data as ChatRow };
}

/** Subscribe to inserts in a room. */
export function subscribeRoom(
  roomId: string,
  onInsert: (row: ChatRow) => void,
): () => void {
  if (!hasSupabaseConfig || !roomId) return () => {};

  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload: any) => {
        const row = payload.new as ChatRow;
        if (row) onInsert(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Convert a message row to a room view. */
export function rowToRoomView(row: ChatRow, viewerId: string): RoomMessageView {
  return {
    id: row.id,
    roomId: (row as any).room_id ?? '',
    senderId: row.sender_id,
    body: row.body,
    timestamp: new Date(row.created_at).getTime(),
    status: rowToStatus(row, viewerId),
    transport: row.transport,
  };
}
