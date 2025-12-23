const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const {
  createMcpExpressApp
} = require("@modelcontextprotocol/sdk/server/express.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const WEB_APP_URL = process.env.WEB_APP_URL || "";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "";
const SHARE_MESSAGE =
  process.env.SHARE_MESSAGE ||
  "Check out iFoundYou to share location and stay safe in emergencies.";

const app = createMcpExpressApp({ host: HOST });
const transports = new Map();

const buildServer = () => {
  const server = new McpServer({
    name: "ifoundyou-mcp",
    version: "0.1.0",
    websiteUrl: WEB_APP_URL || undefined
  });

  server.registerTool(
    "get_app_info",
    {
      title: "iFoundYou Overview",
      description: "Returns a short overview and the web app link if configured.",
      inputSchema: {}
    },
    async () => {
      const lines = [
        "iFoundYou helps people share location and safety updates with trusted contacts.",
        WEB_APP_URL
          ? `Web app: ${WEB_APP_URL}`
          : "Web app URL not configured (set WEB_APP_URL).",
        SUPPORT_EMAIL
          ? `Support: ${SUPPORT_EMAIL}`
          : "Support email not configured (set SUPPORT_EMAIL)."
      ];

      return {
        content: [
          {
            type: "text",
            text: lines.join("\n")
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_web_app_url",
    {
      title: "iFoundYou Web App URL",
      description: "Returns the public web app URL.",
      inputSchema: {}
    },
    async () => {
      const text = WEB_APP_URL
        ? WEB_APP_URL
        : "WEB_APP_URL is not configured on the MCP server.";

      return {
        content: [
          {
            type: "text",
            text
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_share_message",
    {
      title: "Share Message",
      description: "Returns a short share message to send to contacts.",
      inputSchema: {
        include_url: z.boolean().optional().describe("Include the web app URL.")
      }
    },
    async ({ include_url }) => {
      let message = SHARE_MESSAGE;
      if (include_url) {
        message = WEB_APP_URL
          ? `${message} ${WEB_APP_URL}`
          : `${message} (WEB_APP_URL not configured)`;
      }

      return {
        content: [
          {
            type: "text",
            text: message
          }
        ]
      };
    }
  );

  return server;
};

const getSessionId = req => {
  const header = req.headers["mcp-session-id"];
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
};

const mcpPostHandler = async (req, res) => {
  const sessionId = getSessionId(req);
  const entry = sessionId ? transports.get(sessionId) : undefined;

  if (!sessionId) {
    if (!req.body || typeof req.body !== "object") {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: Missing JSON body." },
        id: null
      });
      return;
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: Missing session ID." },
        id: null
      });
      return;
    }

    const server = buildServer();
    let transport;

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: newSessionId => {
        transports.set(newSessionId, { transport, server });
      }
    });

    transport.onclose = () => {
      const currentSessionId = transport.sessionId;
      if (currentSessionId) {
        transports.delete(currentSessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (!entry) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unknown session ID." },
      id: null
    });
    return;
  }

  await entry.transport.handleRequest(req, res, req.body);
};

const mcpGetHandler = async (req, res) => {
  const sessionId = getSessionId(req);
  const entry = sessionId ? transports.get(sessionId) : undefined;

  if (!entry) {
    res.status(400).send("Invalid or missing session ID.");
    return;
  }

  await entry.transport.handleRequest(req, res);
};

const mcpDeleteHandler = async (req, res) => {
  const sessionId = getSessionId(req);
  const entry = sessionId ? transports.get(sessionId) : undefined;

  if (!entry) {
    res.status(400).send("Invalid or missing session ID.");
    return;
  }

  await entry.transport.handleRequest(req, res);
};

app.get("/", (_req, res) => {
  res.json({ name: "ifoundyou-mcp", status: "ok" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", mcpPostHandler);
app.get("/mcp", mcpGetHandler);
app.delete("/mcp", mcpDeleteHandler);

app.listen(PORT, HOST, err => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`MCP server listening on ${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  // eslint-disable-next-line no-console
  console.log("Shutting down MCP server...");
  for (const [sessionId, entry] of transports.entries()) {
    try {
      await entry.transport.close();
      transports.delete(sessionId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to close session ${sessionId}:`, error);
    }
  }
  process.exit(0);
});
