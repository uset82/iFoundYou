# OpenAI App SDK Integration

This project exposes Netlify functions that can be wired as tools in the OpenAI App SDK.

## Tool endpoints
- `get_nearby_friends` -> `GET /.netlify/functions/nearby?radius_m=500`
- `get_discoverable_people` -> `GET /.netlify/functions/discover?radius_m=1000`
- `trigger_proximity_alerts` -> `POST /.netlify/functions/alerts` with `{ "radius_m": 500 }`

All endpoints expect:
- `Authorization: Bearer <supabase_access_token>`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` set in Netlify env vars.

## Tool schema
See `docs/openai-tools.json` for function definitions to register in the App SDK.

## Authentication note
The tool calls require a Supabase access token from a signed-in user. For testing:
- Log in via the web app to obtain the session.
- Use the session access token when invoking the tools.
