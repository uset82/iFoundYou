# iFoundYou

Private, opt-in location sharing for trusted circles with catastrophe-ready
community alerts (water, food, medical, shelter, lost person).

## Features
- Live MapLibre map with your location + nearby friends.
- Friend requests, pending approvals, discovery toggle.
- Proximity alerts + notification feed.
- Emergency broadcast to people nearby (community alerts).
- Supabase Auth (email/password + Google OAuth).

## Stack
- Web: Vite + React
- Maps: MapLibre GL JS
- Backend: Supabase (Postgres + PostGIS + Auth)
- Serverless: Netlify Functions

## Repo layout
- `web/`: frontend (Vite)
- `netlify/functions/`: serverless APIs
- `supabase/`: schema + RLS + triggers
- `docs/`: setup + deployment notes

## Local setup
1) Install deps
```bash
npm --prefix web install
```

2) Configure env
```bash
cp web/.env.example web/.env
```
Fill in:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3) Run dev server
```bash
npm --prefix web run dev
```

## Supabase setup
1) Create a Supabase project.
2) Run SQL in order:
- `supabase/schema.sql`
- `supabase/rls.sql`
- `supabase/triggers.sql`

3) Enable Google OAuth
- Google Cloud Console: create OAuth Client ID (Web).
- Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Paste Client ID + Client Secret into Supabase Auth > Providers > Google.

Notes:
- `public.spatial_ref_sys` is PostGIS-owned. If you see an RLS warning, it can be
  left as-is unless you are using a service role to manage it.

## Netlify deploy
1) Push to GitHub.
2) Create a new Netlify site from the repo.
3) Set environment variables (Site settings > Environment variables):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional, used by scheduled cleanup)

Build config is in `netlify.toml`.

## Community alerts (catastrophe mode)
- Start sharing to attach location.
- Use "Emergency broadcast" to send alerts (water/food/medical/shelter/lost).
- Nearby alerts appear in the Community alerts panel.

## Security
- RLS is enabled for user data tables.
- Service role key is only used on Netlify functions (never in the client).
