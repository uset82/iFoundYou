// Lightweight MCP server that serves widget separately
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = process.env.PORT || 3000;

function createMCPServer(baseUrl) {
    const server = new Server({ name: 'ifoundyou-server', version: '1.0.0' }, { capabilities: { resources: {}, tools: {} } });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [{
            uri: 'ui://widget/ifoundyou.html',
            name: 'iFoundYou',
            description: 'Location tracker',
            mimeType: 'text/html+skybridge'
        }]
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        if (request.params.uri === 'ui://widget/ifoundyou.html') {
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>iFoundYou</title><style>body{margin:0;padding:0}iframe{width:100%;height:100vh;border:none}</style></head><body><iframe src="${baseUrl}/widget" allow="geolocation"></iframe></body></html>`;
            return {
                contents: [{
                    uri: request.params.uri,
                    mimeType: 'text/html+skybridge',
                    text: html,
                    _meta: {
                        'openai/widgetPrefersBorder': true,
                        'openai/widgetDomain': 'https://chatgpt.com',
                        'openai/widgetCSP': {
                            connect_domains: [baseUrl, 'https://*.supabase.co'],
                            resource_domains: [baseUrl, 'https://*.supabase.co'],
                            frame_domains: [baseUrl]
                        }
                    }
                }]
            };
        }
        throw new Error('Resource not found');
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{
            name: 'open_location_tracker',
            description: 'Open iFoundYou location tracker',
            inputSchema: { type: 'object', properties: {} }
        }]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === 'open_location_tracker') {
            return {
                content: [{
                    type: 'resource',
                    resource: {
                        uri: 'ui://widget/ifoundyou.html',
                        mimeType: 'text/html+skybridge',
                        text: 'Opening...'
                    }
                }]
            };
        }
        throw new Error('Unknown tool');
    });

    return server;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/widget', (req, res) => {
    const p = join(__dirname, 'web/dist/index.html');
    existsSync(p) ? res.sendFile(p) : res.status(404).send('Not found');
});

app.use('/assets', express.static(join(__dirname, 'web/dist/assets')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/mcp', async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const server = createMCPServer(baseUrl);
    const transport = new SSEServerTransport('/mcp', res);
    await server.connect(transport);
    console.log('MCP connected');
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
