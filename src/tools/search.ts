import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_CATALOG, ALL_TAGS, TAG_DESCRIPTIONS } from "../api-catalog.js";
import type { CatalogEntry } from "../types.js";

const searchSchema = {
  query: z
    .string()
    .optional()
    .describe(
      "Text to search for in endpoint paths, summaries, and tags (e.g., 'connection', 'sync', 'schema reload')"
    ),
  tag: z
    .string()
    .optional()
    .describe(
      "Filter by API category (e.g., 'Connection Management', 'Group Management', 'User Management')"
    ),
  method: z
    .enum(["GET", "POST", "PATCH", "PUT", "DELETE"])
    .optional()
    .describe("Filter by HTTP method"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .optional()
    .describe("Max results to return (default 20)"),
};

function scoreEntry(entry: CatalogEntry, query: string): number {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  let score = 0;

  const path = entry.path.toLowerCase();
  const summary = entry.summary.toLowerCase();
  const tag = entry.tag.toLowerCase();

  // Full query matches
  if (path.includes(q)) score += 10;
  if (summary.includes(q)) score += 8;
  if (tag.includes(q)) score += 5;

  // Word-level matches
  for (const word of words) {
    if (path.includes(word)) score += 3;
    if (summary.includes(word)) score += 3;
    if (tag.includes(word)) score += 2;
  }

  return score;
}

function formatEntry(entry: CatalogEntry): string {
  const lines: string[] = [];
  lines.push(`  ${entry.method.padEnd(6)} ${entry.path}`);
  lines.push(`         ${entry.summary}`);
  if (entry.pathParams.length > 0) {
    lines.push(`         Path params: ${entry.pathParams.join(", ")}`);
  }
  if (entry.queryParams.length > 0) {
    lines.push(`         Query params: ${entry.queryParams.join(", ")}`);
  }
  if (entry.hasBody) {
    lines.push(`         Accepts request body: yes`);
  }
  return lines.join("\n");
}

function buildOverview(): string {
  const tagCounts = new Map<string, number>();
  for (const entry of API_CATALOG) {
    tagCounts.set(entry.tag, (tagCounts.get(entry.tag) ?? 0) + 1);
  }

  const lines: string[] = [
    `Fivetran REST API — ${API_CATALOG.length} endpoints across ${ALL_TAGS.length} categories\n`,
  ];

  for (const tag of ALL_TAGS) {
    const count = tagCounts.get(tag) ?? 0;
    const desc = TAG_DESCRIPTIONS[tag] ?? "";
    lines.push(`  ${tag} (${count})${desc ? ` — ${desc}` : ""}`);
  }

  lines.push(
    `\nUse search with a tag or query to explore endpoints, then use execute to call them.`
  );
  return lines.join("\n");
}

export function registerSearchTool(server: McpServer): void {
  server.tool(
    "search",
    "Search the Fivetran REST API catalog to discover endpoints. Returns method, path, summary, and parameter details. Call with no arguments to see all available categories.",
    searchSchema,
    async (params) => {
      const { query, tag, method, limit = 20 } = params;

      // Overview mode: no filters provided
      if (!query && !tag && !method) {
        return { content: [{ type: "text", text: buildOverview() }] };
      }

      let results = [...API_CATALOG];

      // Filter by tag
      if (tag) {
        const tagLower = tag.toLowerCase();
        results = results.filter((e) => e.tag.toLowerCase() === tagLower);
        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No endpoints found for tag "${tag}".\nAvailable tags: ${ALL_TAGS.join(", ")}`,
              },
            ],
          };
        }
      }

      // Filter by method
      if (method) {
        results = results.filter((e) => e.method === method);
      }

      // Score and sort by query
      if (query) {
        const scored = results
          .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score);
        results = scored.map(({ entry }) => entry);
      }

      // Apply limit
      const total = results.length;
      results = results.slice(0, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No endpoints found matching your search.\nTry a broader query or browse by tag: ${ALL_TAGS.join(", ")}`,
            },
          ],
        };
      }

      const header =
        total > results.length
          ? `Found ${total} endpoints (showing first ${results.length}):\n`
          : `Found ${results.length} endpoint${results.length === 1 ? "" : "s"}:\n`;

      const body = results.map(formatEntry).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + body }] };
    }
  );
}
