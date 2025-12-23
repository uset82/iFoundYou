// Simple proxy to add the ngrok warning bypass header.
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = Number.parseInt(process.env.PROXY_PORT || "3001", 10);
const TARGET_URL = process.env.MCP_TARGET_URL || "http://127.0.0.1:3000";

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  res.setHeader("User-Agent", "ChatGPT-MCP-Client");
  next();
});

app.use(cors());
app.use(express.json());

app.all("*", async (req, res) => {
  const targetUrl = `${TARGET_URL}${req.url}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        "ngrok-skip-browser-warning": "true",
        "User-Agent": "ChatGPT-MCP-Client"
      },
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined
    });

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(response.status);

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      const body = await response.text();
      res.send(body);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Proxy error" });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Proxy server running on port ${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Forwarding to: ${TARGET_URL}`);
  // eslint-disable-next-line no-console
  console.log(`Use with ngrok: ngrok http ${PORT}`);
});
