import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildUrl,
  buildAuthHeader,
  unwrapData,
  formatResponse,
  formatError,
} from "../utils.js";

const executeSchema = {
  method: z
    .enum(["GET", "POST", "PATCH", "PUT", "DELETE"])
    .describe("HTTP method"),
  path: z
    .string()
    .describe(
      'API path (e.g., "/connections", "/groups/{groupId}", "/connections/{connectionId}/schemas")'
    ),
  body: z
    .record(z.unknown())
    .optional()
    .describe("Request body for POST/PATCH/PUT requests (JSON object)"),
  params: z
    .record(z.string())
    .optional()
    .describe(
      'Query parameters (e.g., { "limit": "10", "cursor": "abc123" })'
    ),
};

export function registerExecuteTool(
  server: McpServer,
  apiKey: string,
  apiSecret: string
): void {
  const authHeader = buildAuthHeader(apiKey, apiSecret);

  server.tool(
    "execute",
    "Execute any Fivetran REST API call. Use the search tool first to discover available endpoints and their parameters.",
    executeSchema,
    async (params) => {
      const { method, path, body, params: queryParams } = params;

      const url = buildUrl(path, queryParams);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      };

      if (body && ["POST", "PATCH", "PUT"].includes(method)) {
        fetchOptions.body = JSON.stringify(body);
      }

      try {
        const response = await fetch(url, fetchOptions);
        const contentType = response.headers.get("content-type") ?? "";

        let data: unknown;
        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          return {
            content: [
              { type: "text", text: formatError(response.status, data) },
            ],
            isError: true,
          };
        }

        const unwrapped = unwrapData(data);
        return {
          content: [{ type: "text", text: formatResponse(unwrapped) }],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Connection error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
