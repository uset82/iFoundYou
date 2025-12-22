# MCP Deployment (Render)

Use the included `render.yaml` to deploy the MCP server as a Render web service.

## Render setup
1. Create a new Render **Web Service** from this repo.
2. Render detects `render.yaml` and uses:
   - Build: `cd mcp && npm install`
   - Start: `cd mcp && npm run start`
3. Set environment variables:
   - `WEB_APP_URL` (required for sharing links)
   - `SUPPORT_EMAIL` (optional)
   - `SHARE_MESSAGE` (optional)

Render provides `PORT` automatically. You do not need to set it.

## ChatGPT app config
- MCP Server URL: `https://<your-service>.onrender.com/mcp`
- Authentication: `No Auth`
