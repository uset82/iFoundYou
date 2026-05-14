-- Mesh Guardian Phase 1.7 — group chat (rooms)
--
-- Adds chat_rooms + chat_room_members tables and a nullable room_id on
-- messages so a single messages table serves both 1-on-1 and group chats.
--
-- Run this AFTER messages_status.sql.

create table if not exists chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists chat_room_members (
  room_id uuid not null references chat_rooms on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists chat_room_members_user_idx
  on chat_room_members (user_id);

-- Add room_id to messages so group messages and direct messages share one table.
alter table public.messages
  add column if not exists room_id uuid references chat_rooms on delete cascade;

create index if not exists messages_room_time_idx
  on public.messages (room_id, created_at desc)
  where room_id is not null;

-- Allow group messages where recipient_id can equal sender_id when room_id is set.
-- The original schema has a check constraint preventing self-send. Drop it and
-- replace with a constraint that allows self only inside rooms.
alter table public.messages drop constraint if exists messages_check;
alter table public.messages
  add constraint messages_self_send_only_in_room
  check (sender_id <> recipient_id or room_id is not null);

-- RLS for rooms.
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;

-- Members can see the room they belong to.
drop policy if exists "chat_rooms_select_member" on public.chat_rooms;
create policy "chat_rooms_select_member"
on public.chat_rooms
for select
using (
  exists (
    select 1 from public.chat_room_members
    where chat_room_members.room_id = chat_rooms.id
      and chat_room_members.user_id = auth.uid()
  )
);

-- Anyone authenticated can create a room (they auto-become owner via the
-- created_by column; the client also inserts a membership row immediately).
drop policy if exists "chat_rooms_insert_authed" on public.chat_rooms;
create policy "chat_rooms_insert_authed"
on public.chat_rooms
for insert
with check (auth.uid() = created_by);

-- Owner can update / delete the room.
drop policy if exists "chat_rooms_update_owner" on public.chat_rooms;
create policy "chat_rooms_update_owner"
on public.chat_rooms
for update
using (auth.uid() = created_by);

drop policy if exists "chat_rooms_delete_owner" on public.chat_rooms;
create policy "chat_rooms_delete_owner"
on public.chat_rooms
for delete
using (auth.uid() = created_by);

-- Members can see their own membership row.
drop policy if exists "chat_room_members_select_self" on public.chat_room_members;
create policy "chat_room_members_select_self"
on public.chat_room_members
for select
using (auth.uid() = user_id);

-- A user can also see other members of rooms they are in (so the UI can show "X people in room").
drop policy if exists "chat_room_members_select_co_members" on public.chat_room_members;
create policy "chat_room_members_select_co_members"
on public.chat_room_members
for select
using (
  exists (
    select 1 from public.chat_room_members me
    where me.room_id = chat_room_members.room_id
      and me.user_id = auth.uid()
  )
);

-- Room owner can add members.
drop policy if exists "chat_room_members_insert_owner" on public.chat_room_members;
create policy "chat_room_members_insert_owner"
on public.chat_room_members
for insert
with check (
  exists (
    select 1 from public.chat_rooms
    where chat_rooms.id = chat_room_members.room_id
      and chat_rooms.created_by = auth.uid()
  )
  -- Owners may also self-insert (used by the create-room flow).
  or auth.uid() = chat_room_members.user_id
);

-- A member can remove themselves.
drop policy if exists "chat_room_members_delete_self" on public.chat_room_members;
create policy "chat_room_members_delete_self"
on public.chat_room_members
for delete
using (auth.uid() = user_id);

-- Update the messages select policy so room members can see room messages too.
drop policy if exists "messages_select_participants" on public.messages;
create policy "messages_select_participants"
on public.messages
for select
using (
  -- Direct message between friends
  (
    room_id is null
    and (auth.uid() = sender_id or auth.uid() = recipient_id)
    and public.is_friend(sender_id, recipient_id)
  )
  -- Or a room message the user is a member of
  or (
    room_id is not null
    and exists (
      select 1 from public.chat_room_members
      where chat_room_members.room_id = messages.room_id
        and chat_room_members.user_id = auth.uid()
    )
  )
);

-- Update insert policy: allow room sends if the sender is a member.
drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender"
on public.messages
for insert
with check (
  auth.uid() = sender_id
  and (
    (room_id is null and public.is_friend(sender_id, recipient_id))
    or (
      room_id is not null
      and exists (
        select 1 from public.chat_room_members
        where chat_room_members.room_id = messages.room_id
          and chat_room_members.user_id = auth.uid()
      )
    )
  )
);
