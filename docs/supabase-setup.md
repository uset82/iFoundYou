# Supabase Setup

1) Create a Supabase project.
2) In the SQL editor, run these files in order:
   - `supabase/schema.sql`
   - `supabase/rls.sql`
   - `supabase/triggers.sql`
   If you want me to run them locally, set `SUPABASE_DB_URL` in `supabase/.env`
   and I will apply them via SQL client.
3) In Authentication settings, enable Email/Password sign-in.
   - Optional: enable Google provider for OAuth sign-in.
     - Set Redirect URL to your dev site (e.g. `http://localhost:5173`) and later your Netlify URL.
4) Copy the project URL and anon key into `web/.env`:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

5) Add Netlify function env vars (Netlify UI or local `.env`):

```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
```

6) Start the web app from `web/` with `npm run dev`.
