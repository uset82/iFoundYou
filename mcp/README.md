# iFoundYou MCP Server

This folder contains the MCP server used for the ChatGPT app integration.

## Local run
1. `cd mcp`
2. `npm install`
3. `copy .env.example .env` and fill in values.
4. `npm run start`

The MCP endpoint is available at `http://localhost:3000/mcp` by default.

## Tools
- `get_app_info` - Short overview and configured web app URL.
- `get_web_app_url` - Returns the public web app URL.
- `get_share_message` - Returns a share message, optionally including the URL.
