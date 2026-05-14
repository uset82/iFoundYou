-- Mesh Guardian Phase 0.7 — Block / Report
-- Adds a blocked_users table so users can hide and report bad actors
-- discovered in the Discover view.
--
-- Run this AFTER schema.sql + rls.sql.

create table if not exists blocked_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  blocked_id uuid not null references profiles on delete cascade,
  reason text,
  reported boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, blocked_id),
  check (user_id <> blocked_id)
);

create index if not exists blocked_users_user_idx on blocked_users (user_id);
create index if not exists blocked_users_reported_idx on blocked_users (reported)
  where reported = true;

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_select_self" on public.blocked_users;
create policy "blocked_users_select_self"
on public.blocked_users
for select
using (auth.uid() = user_id);

drop policy if exists "blocked_users_insert_self" on public.blocked_users;
create policy "blocked_users_insert_self"
on public.blocked_users
for insert
with check (auth.uid() = user_id);

drop policy if exists "blocked_users_delete_self" on public.blocked_users;
create policy "blocked_users_delete_self"
on public.blocked_users
for delete
using (auth.uid() = user_id);
