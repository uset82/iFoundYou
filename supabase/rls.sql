create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.friendships
    where status = 'accepted'
      and (
        (user_id = user_a and friend_id = user_b)
        or (user_id = user_b and friend_id = user_a)
      )
  );
$$;

create or replace function public.match_contacts(emails text[], phones text[])
returns table (id uuid, display_name text, match_type text)
language sql
security definer
set search_path = public
as $$
  with input_emails as (
    select distinct lower(trim(value)) as email
    from unnest(coalesce(emails, array[]::text[])) value
    where length(trim(value)) > 0
  ),
  input_phones as (
    select distinct regexp_replace(value, '\D', '', 'g') as phone
    from unnest(coalesce(phones, array[]::text[])) value
    where length(regexp_replace(value, '\D', '', 'g')) >= 7
  )
  select
    profiles.id,
    profiles.display_name,
    case
      when profiles.contact_email is not null
        and profiles.contact_email in (select email from input_emails)
        then 'email'
      when profiles.contact_phone is not null
        and profiles.contact_phone in (select phone from input_phones)
        then 'phone'
      else null
    end as match_type
  from public.profiles
  where auth.role() = 'authenticated'
    and profiles.id <> auth.uid()
    and (
      (profiles.contact_email is not null
        and profiles.contact_email in (select email from input_emails))
      or (profiles.contact_phone is not null
        and profiles.contact_phone in (select phone from input_phones))
    );
$$;

revoke all on function public.match_contacts(text[], text[]) from public;
grant execute on function public.match_contacts(text[], text[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.share_sessions enable row level security;
alter table public.location_updates enable row level security;
alter table public.last_locations enable row level security;
alter table public.interests enable row level security;
alter table public.user_interests enable row level security;
alter table public.notifications enable row level security;
alter table public.community_alerts enable row level security;
-- spatial_ref_sys is owned by extensions; skip in user-run SQL editor sessions.

drop policy if exists "profiles_select_self_or_friends" on public.profiles;
create policy "profiles_select_self_or_friends"
on public.profiles
for select
using (
  auth.uid() = id
  or public.is_friend(auth.uid(), id)
  or exists (
    select 1
    from public.privacy_settings
    where privacy_settings.user_id = profiles.id
      and privacy_settings.discoverable = true
  )
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (auth.uid() = id);

drop policy if exists "friendships_select_participants" on public.friendships;
create policy "friendships_select_participants"
on public.friendships
for select
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friendships_insert_self" on public.friendships;
create policy "friendships_insert_self"
on public.friendships
for insert
with check (auth.uid() = user_id);

drop policy if exists "friendships_update_participants" on public.friendships;
create policy "friendships_update_participants"
on public.friendships
for update
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "privacy_select_self" on public.privacy_settings;
create policy "privacy_select_self"
on public.privacy_settings
for select
using (auth.uid() = user_id);

drop policy if exists "privacy_select_discoverable" on public.privacy_settings;
create policy "privacy_select_discoverable"
on public.privacy_settings
for select
using (discoverable = true);

drop policy if exists "privacy_insert_self" on public.privacy_settings;
create policy "privacy_insert_self"
on public.privacy_settings
for insert
with check (auth.uid() = user_id);

drop policy if exists "privacy_update_self" on public.privacy_settings;
create policy "privacy_update_self"
on public.privacy_settings
for update
using (auth.uid() = user_id);

drop policy if exists "share_sessions_select_self" on public.share_sessions;
create policy "share_sessions_select_self"
on public.share_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "share_sessions_insert_self" on public.share_sessions;
create policy "share_sessions_insert_self"
on public.share_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "share_sessions_update_self" on public.share_sessions;
create policy "share_sessions_update_self"
on public.share_sessions
for update
using (auth.uid() = user_id);

drop policy if exists "location_updates_insert_self" on public.location_updates;
create policy "location_updates_insert_self"
on public.location_updates
for insert
with check (auth.uid() = user_id);

drop policy if exists "location_updates_select_self" on public.location_updates;
create policy "location_updates_select_self"
on public.location_updates
for select
using (auth.uid() = user_id);

drop policy if exists "last_locations_select_self_or_friends" on public.last_locations;
create policy "last_locations_select_self_or_friends"
on public.last_locations
for select
using (
  auth.uid() = user_id
  or public.is_friend(auth.uid(), user_id)
  or exists (
    select 1
    from public.privacy_settings
    where privacy_settings.user_id = last_locations.user_id
      and privacy_settings.discoverable = true
  )
);

drop policy if exists "last_locations_insert_self" on public.last_locations;
create policy "last_locations_insert_self"
on public.last_locations
for insert
with check (auth.uid() = user_id);

drop policy if exists "last_locations_update_self" on public.last_locations;
create policy "last_locations_update_self"
on public.last_locations
for update
using (auth.uid() = user_id);

drop policy if exists "interests_select_all" on public.interests;
create policy "interests_select_all"
on public.interests
for select
using (true);

drop policy if exists "user_interests_select_self" on public.user_interests;
create policy "user_interests_select_self"
on public.user_interests
for select
using (auth.uid() = user_id);

drop policy if exists "user_interests_insert_self" on public.user_interests;
create policy "user_interests_insert_self"
on public.user_interests
for insert
with check (auth.uid() = user_id);

drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self"
on public.notifications
for select
using (auth.uid() = user_id);

drop policy if exists "notifications_insert_self" on public.notifications;
create policy "notifications_insert_self"
on public.notifications
for insert
with check (auth.uid() = user_id);

drop policy if exists "community_alerts_select_active" on public.community_alerts;
create policy "community_alerts_select_active"
on public.community_alerts
for select
using (
  auth.role() = 'authenticated'
  and active = true
  and (expires_at is null or expires_at > now())
);

drop policy if exists "community_alerts_insert_self" on public.community_alerts;
create policy "community_alerts_insert_self"
on public.community_alerts
for insert
with check (auth.uid() = user_id);

drop policy if exists "community_alerts_update_self" on public.community_alerts;
create policy "community_alerts_update_self"
on public.community_alerts
for update
using (auth.uid() = user_id);
