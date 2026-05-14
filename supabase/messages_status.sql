-- Mesh Guardian Phase 1.1 — message status + transport columns
-- Adds delivered_at, read_at, and transport so the chat layer can track
-- per-message status (pending → sent → delivered → read) and which
-- transport carried each message (internet / mesh-bt / mesh-http / multipeer).
--
-- Run this AFTER schema.sql + rls.sql.

alter table public.messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists transport text not null default 'internet';

create index if not exists messages_recipient_unread_idx
  on public.messages (recipient_id, read_at)
  where read_at is null;

-- Allow recipient to mark a message as delivered or read.
drop policy if exists "messages_update_recipient_status" on public.messages;
create policy "messages_update_recipient_status"
on public.messages
for update
using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id);
