#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSearchTool } from "./tools/search.js";
import { registerExecuteTool } from "./tools/execute.js";
import { registerNativeTools } from "./tools/native.js";

const apiKey = process.env.FIVETRAN_API_KEY;
const apiSecret = process.env.FIVETRAN_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error(
    "Error: FIVETRAN_API_KEY and FIVETRAN_API_SECRET environment variables are required.\n" +
      "Get your API key and secret from: Fivetran Dashboard → Settings → API Key"
  );
  process.exit(1);
}

const server = new McpServer({
  name: "fivetran-mcp",
  version: "1.0.0",
});

registerNativeTools(server, apiKey, apiSecret);
registerSearchTool(server);
registerExecuteTool(server, apiKey, apiSecret);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Fivetran MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
