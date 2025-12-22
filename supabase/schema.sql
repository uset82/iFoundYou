create extension if not exists pgcrypto;
create extension if not exists postgis;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'friendship_status') then
    create type friendship_status as enum ('pending', 'accepted', 'blocked');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'alert_category') then
    create type alert_category as enum (
      'water',
      'food',
      'medical',
      'shelter',
      'lost',
      'other'
    );
  end if;
end
$$;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now()
);

alter table if exists profiles
  add column if not exists contact_email text;

alter table if exists profiles
  add column if not exists contact_phone text;

create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  friend_id uuid not null references profiles on delete cascade,
  status friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists privacy_settings (
  user_id uuid primary key references profiles on delete cascade,
  default_visibility text not null default 'friends',
  share_duration_minutes integer not null default 240,
  coarse_location boolean not null default false,
  discoverable boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table if exists privacy_settings
  add column if not exists discoverable boolean not null default false;

create table if not exists share_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  mode text not null default 'manual',
  active boolean not null default true
);

create table if not exists location_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  lat double precision not null,
  lon double precision not null,
  accuracy_m double precision,
  source text,
  geom geography(point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists last_locations (
  user_id uuid primary key references profiles on delete cascade,
  lat double precision not null,
  lon double precision not null,
  accuracy_m double precision,
  geom geography(point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  ) stored,
  updated_at timestamptz not null default now()
);

create table if not exists interests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists user_interests (
  user_id uuid not null references profiles on delete cascade,
  interest_id uuid not null references interests on delete cascade,
  primary key (user_id, interest_id)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  type text not null,
  payload_json jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists community_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  category alert_category not null default 'other',
  message text not null,
  lat double precision not null,
  lon double precision not null,
  accuracy_m double precision,
  radius_m integer not null default 2000,
  geom geography(point, 4326) generated always as (
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  ) stored,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true
);

create index if not exists location_updates_user_time_idx
  on location_updates (user_id, created_at desc);

create index if not exists profiles_contact_email_idx
  on profiles (contact_email);

create index if not exists profiles_contact_phone_idx
  on profiles (contact_phone);

create index if not exists last_locations_geom_idx
  on last_locations using gist (geom);

create index if not exists friendships_user_status_idx
  on friendships (user_id, status);

create index if not exists community_alerts_geom_idx
  on community_alerts using gist (geom);

create index if not exists community_alerts_created_idx
  on community_alerts (created_at desc);
