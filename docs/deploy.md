# Deployment Notes

## Netlify
1) Connect the repo in Netlify.
2) Build command: handled by `netlify.toml`.
3) Add environment variables:

```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4) Deploy and open the site.

## Scheduled cleanup
`netlify/functions/cleanup.js` is a scheduled function that deletes
location updates older than 7 days. It requires the service role key.
