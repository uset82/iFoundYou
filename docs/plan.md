# Loopt-like Test App Plan

## Goals and success criteria
- MVP: web app that shows a map with friends, lets users share location, and sends proximity alerts.
- Privacy: explicit opt-in sharing, per-friend visibility, and time-limited sharing sessions.
- Deployment: web app on Netlify; backend services reachable from the web app.
- AI: OpenAI App SDK integration for "nearby friends" and "meetup" workflows.

## Non-goals (for MVP)
- Native mobile apps.
- Payments or merchant deal inventory.
- Full Loopt Mix discovery at scale.

## Proposed stack (defaults)
- Frontend: Vite + React + TypeScript, MapLibre GL, OpenStreetMap tiles.
- Backend: Supabase Postgres + PostGIS, Supabase Auth, Supabase Realtime.
- API layer: Netlify Functions (Node/TS) for server-only logic.
- Notifications: Web Push for browsers; email/SMS optional later.
- AI: OpenAI App SDK tools backed by Netlify Functions.

## High-level architecture
- Web client captures location (or mock location) and posts to API.
- API writes latest location to PostGIS and emits realtime updates.
- Client subscribes to realtime updates for friend markers.
- Server checks proximity and triggers notifications.
- OpenAI tools query the same API for summaries and suggestions.

## Data model (MVP)
- users: id, name, avatar_url, created_at.
- friendships: id, user_id, friend_id, status (pending/accepted/blocked), created_at.
- privacy_settings: user_id, default_visibility (none/friends/selected), share_duration_minutes, coarse_location (bool).
- share_sessions: id, user_id, started_at, ends_at, mode (manual/auto), active (bool).
- location_updates: id, user_id, lat, lon, accuracy_m, source, created_at.
- last_locations: user_id, lat, lon, accuracy_m, updated_at (materialized latest row).
- interests: id, name.
- user_interests: user_id, interest_id.
- notifications: id, user_id, type, payload_json, created_at, delivered_at.

Indexes
- location_updates on (user_id, created_at desc).
- last_locations on (geom) with GIST for ST_DWithin.
- friendships on (user_id, status) and (friend_id, status).

## API contract (initial)
- POST /api/auth/login (Supabase handles auth in MVP; no custom endpoint needed).
- POST /api/location/update: body { lat, lon, accuracy_m, source }.
- GET /api/friends: list friends and their share status.
- POST /api/friends/request: body { friend_id }.
- POST /api/friends/respond: body { request_id, action }.
- POST /api/sharing/start: body { duration_minutes, coarse_location }.
- POST /api/sharing/stop.
- GET /api/nearby: query { radius_m } returns nearby friends (respecting privacy).
- GET /api/discover: query { radius_m, interests[] } returns opt-in nearby users.
- POST /api/notify/test: triggers a test notification.

## Privacy and safety
- Default sharing OFF; explicit toggle required.
- Share duration default 4 hours; auto-expire sessions.
- Coarse location option (round to ~200-500m).
- Retention policy: keep raw updates 7 days, keep only latest afterward.
- RLS enforced: users only see their own data and accepted friends.

## Realtime and proximity alerts
- Use Supabase Realtime to stream location updates to the client.
- Server checks proximity (ST_DWithin) on update; if newly within radius, create notification.
- Deduplicate alerts with a short cooldown window (e.g., 30 minutes).

## OpenAI App SDK integration
- Tools:
  - get_nearby_friends(radius_m)
  - get_meetup_suggestions(radius_m, category)
  - get_sharing_status()
  - start_sharing(duration_minutes, coarse_location)
- AI prompt context includes privacy rules and "test-only" usage.

## Deployment
- Netlify: deploy frontend from /web, functions from /netlify/functions.
- Supabase: create project, enable PostGIS, set RLS policies.
- Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.

## Milestones and tasks
1) Foundation
- Create repo structure (/web, /netlify/functions, /docs).
- Add netlify.toml and baseline env docs.
- Scaffold Vite app.

2) Data and API
- Create Supabase schema and RLS policies.
- Implement location update and friend APIs.

3) Core UI
- Auth flow.
- Map view with friend markers.
- Share toggle and duration picker.

4) Alerts and discovery
- Proximity detection and notification pipeline.
- Opt-in discovery endpoint.

5) AI integration
- Implement OpenAI App SDK tools.
- Build ChatGPT app surface and test flows.

6) Hardening
- Rate limits, abuse protections, logging, and retention job.
