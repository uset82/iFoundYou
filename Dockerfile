FROM node:18-alpine

WORKDIR /app/mcp

COPY mcp/package*.json ./
RUN npm ci --omit=dev

COPY mcp ./

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
