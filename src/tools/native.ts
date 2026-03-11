import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildUrl,
  buildAuthHeader,
  unwrapData,
  formatResponse,
  formatError,
  summarizeWriteResponse,
} from "../utils.js";

const VERBOSE_DESC = "Return full API response instead of compact summary (default false)";

async function ft(
  auth: string,
  method: string,
  path: string,
  params?: Record<string, string>,
  body?: unknown,
  compact?: string
): Promise<{ text: string; isError?: boolean }> {
  const url = buildUrl(path, params);
  const opts: RequestInit = {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
  };
  if (body && ["POST", "PATCH", "PUT"].includes(method)) {
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    const ct = res.headers.get("content-type") ?? "";
    const data = ct.includes("json") ? await res.json() : await res.text();
    if (!res.ok) return { text: formatError(res.status, data), isError: true };
    const unwrapped = unwrapData(data);
    if (compact) {
      return { text: summarizeWriteResponse(unwrapped, compact) };
    }
    return { text: formatResponse(unwrapped) };
  } catch (err) {
    return {
      text: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

export function registerNativeTools(
  server: McpServer,
  apiKey: string,
  apiSecret: string
): void {
  const auth = buildAuthHeader(apiKey, apiSecret);

  // ─── Connection Management (8 tools) ───────────────────────────────

  // 1. List Connections
  server.tool(
    "list_connections",
    "List all Fivetran connections (connectors) with their sync status. Optionally filter by group.",
    {
      group_id: z.string().optional().describe("Filter to connections in this group ID"),
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results (default 100)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    async ({ group_id, limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const path = group_id ? `/groups/${group_id}/connections` : "/connections";
      const r = await ft(auth, "GET", path, params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 2. Get Connection Details
  server.tool(
    "get_connection_details",
    "Get detailed information for a specific connection including config, status, sync state, and schedule.",
    {
      connection_id: z.string().describe("The connection ID (e.g., 'spoke_foolish')"),
    },
    async ({ connection_id }) => {
      const r = await ft(auth, "GET", `/connections/${connection_id}`);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 3. Create Connection
  server.tool(
    "create_connection",
    "Create a new Fivetran connection (connector). Use get_connector_metadata to discover available connector types and their required config. Returns compact confirmation by default — set verbose=true for full response.",
    {
      group_id: z.string().describe("Group (destination) to create the connection in"),
      service: z.string().describe("Connector type (e.g., 'google_sheets', 'postgres', 'salesforce')"),
      config: z.record(z.unknown()).describe("Connector-specific configuration object"),
      paused: z.boolean().optional().describe("Create in paused state (default false)"),
      trust_certificates: z.boolean().optional().describe("Auto-trust certificates"),
      trust_fingerprints: z.boolean().optional().describe("Auto-trust fingerprints"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ group_id, service, config, paused, trust_certificates, trust_fingerprints, verbose }) => {
      const body: Record<string, unknown> = { group_id, service, config };
      if (paused !== undefined) body.paused = paused;
      if (trust_certificates !== undefined) body.trust_certificates = trust_certificates;
      if (trust_fingerprints !== undefined) body.trust_fingerprints = trust_fingerprints;
      const r = await ft(auth, "POST", "/connections", undefined, body, verbose ? undefined : "Connection created successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 4. Update Connection
  server.tool(
    "update_connection",
    "Update a connection's configuration, schedule, or settings. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      config: z.record(z.unknown()).optional().describe("Updated connector-specific config"),
      paused: z.boolean().optional().describe("Set paused state"),
      sync_frequency: z.number().optional().describe("Sync frequency in minutes (e.g., 60, 360, 1440)"),
      schedule_type: z.enum(["auto", "manual"]).optional().describe("Schedule type"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, config, paused, sync_frequency, schedule_type, verbose }) => {
      const body: Record<string, unknown> = {};
      if (config) body.config = config;
      if (paused !== undefined) body.paused = paused;
      if (sync_frequency !== undefined) body.sync_frequency = sync_frequency;
      if (schedule_type) body.schedule_type = schedule_type;
      const r = await ft(auth, "PATCH", `/connections/${connection_id}`, undefined, body, verbose ? undefined : "Connection updated successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 5. Delete Connection
  server.tool(
    "delete_connection",
    "Permanently delete a connection and all its synced data configuration. This cannot be undone.",
    {
      connection_id: z.string().describe("The connection ID to delete"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, verbose }) => {
      const r = await ft(auth, "DELETE", `/connections/${connection_id}`, undefined, undefined, verbose ? undefined : "Connection deleted successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 6. Trigger Sync
  server.tool(
    "trigger_sync",
    "Trigger an immediate sync for a connection without waiting for the next scheduled sync. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      force: z.boolean().optional().describe("Force sync even if one is already running (default false)"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, force, verbose }) => {
      const body: Record<string, unknown> = {};
      if (force) body.force = force;
      const r = await ft(auth, "POST", `/connections/${connection_id}/sync`, undefined, body, verbose ? undefined : "Sync triggered successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 7. Pause Connection
  server.tool(
    "pause_connection",
    "Pause a connection's sync schedule. The connection will not sync until resumed. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, verbose }) => {
      const r = await ft(auth, "PATCH", `/connections/${connection_id}`, undefined, { paused: true }, verbose ? undefined : "Connection paused successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 8. Resume Connection
  server.tool(
    "resume_connection",
    "Resume a paused connection. It will sync on its next scheduled interval. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, verbose }) => {
      const r = await ft(auth, "PATCH", `/connections/${connection_id}`, undefined, { paused: false }, verbose ? undefined : "Connection resumed successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // ─── Schema Management (3 tools) ───────────────────────────────────

  // 9. Get Connection Schema
  server.tool(
    "get_connection_schema",
    "Get the schema configuration for a connection: all schemas, tables, and columns with their enabled/disabled state.",
    {
      connection_id: z.string().describe("The connection ID"),
    },
    async ({ connection_id }) => {
      const r = await ft(auth, "GET", `/connections/${connection_id}/schemas`);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 10. Update Connection Schema
  server.tool(
    "update_connection_schema",
    "Update schema config to enable/disable schemas, tables, or columns for a connection. Returns compact confirmation by default — set verbose=true for full schema response.",
    {
      connection_id: z.string().describe("The connection ID"),
      schemas: z.record(z.unknown()).describe("Schema configuration object with enabled/disabled tables and columns"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, schemas, verbose }) => {
      const r = await ft(auth, "PATCH", `/connections/${connection_id}/schemas`, undefined, { schemas }, verbose ? undefined : "Schema updated successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 11. Reload Schema
  server.tool(
    "reload_schema",
    "Reload the schema configuration from the source. Detects new tables, columns, or schema changes. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, verbose }) => {
      const r = await ft(auth, "POST", `/connections/${connection_id}/schemas/reload`, undefined, undefined, verbose ? undefined : "Schema reload triggered successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // ─── Sync Monitoring (3 tools) ─────────────────────────────────────

  // 12. Get Sync Status
  server.tool(
    "get_sync_status",
    "Get the current sync status for a connection: sync state, last sync time, schedule, and any warnings or failures.",
    {
      connection_id: z.string().describe("The connection ID"),
    },
    async ({ connection_id }) => {
      const r = await ft(auth, "GET", `/connections/${connection_id}`);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 13. Get Table Status
  server.tool(
    "get_table_status",
    "Get per-table sync status for a connection: enabled state, sync mode, and metadata for each table.",
    {
      connection_id: z.string().describe("The connection ID"),
    },
    async ({ connection_id }) => {
      const r = await ft(auth, "GET", `/connections/${connection_id}/schemas`);
      if (r.isError) {
        return { content: [{ type: "text" as const, text: r.text }], isError: true };
      }
      try {
        const data = JSON.parse(r.text);
        const tables: Array<Record<string, unknown>> = [];
        const schemas = data.schemas ?? data;
        if (typeof schemas === "object" && schemas !== null) {
          for (const [schemaName, schemaObj] of Object.entries(schemas)) {
            const schema = schemaObj as Record<string, unknown>;
            const schemaTables = schema.tables as Record<string, unknown> | undefined;
            if (schemaTables) {
              for (const [tableName, tableObj] of Object.entries(schemaTables)) {
                const table = tableObj as Record<string, unknown>;
                tables.push({
                  schema: schemaName,
                  table: tableName,
                  enabled: table.enabled ?? (table.enabled_patch_settings as Record<string, unknown> | undefined)?.allowed,
                  sync_mode: table.sync_mode,
                });
              }
            }
          }
        }
        if (tables.length > 0) {
          return { content: [{ type: "text" as const, text: formatResponse(tables) }] };
        }
      } catch {
        // Fall through to return raw response
      }
      return { content: [{ type: "text" as const, text: r.text }] };
    }
  );

  // 14. Get Sync Logs
  server.tool(
    "get_sync_logs",
    "Get sync logs for a connection. Returns the connection state including sync history and warnings.",
    {
      connection_id: z.string().describe("The connection ID"),
    },
    async ({ connection_id }) => {
      const r = await ft(auth, "GET", `/connections/${connection_id}/state`);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // ─── Group & Destination Management (4 tools) ──────────────────────

  // 15. List Groups
  server.tool(
    "list_groups",
    "List all groups (workspaces) in the Fivetran account.",
    {
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results (default 100)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const r = await ft(auth, "GET", "/groups", params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 16. Get Group Connectors
  server.tool(
    "get_group_connectors",
    "List all connections within a specific group.",
    {
      group_id: z.string().describe("The group ID"),
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ group_id, limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const r = await ft(auth, "GET", `/groups/${group_id}/connections`, params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 17. List Destinations
  server.tool(
    "list_destinations",
    "List all destinations in the account with their configuration and status.",
    {
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const r = await ft(auth, "GET", "/destinations", params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 18. Test Destination
  server.tool(
    "test_destination",
    "Run setup tests for a destination to verify connectivity and configuration. Returns compact confirmation by default — set verbose=true for full response.",
    {
      destination_id: z.string().describe("The destination ID"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ destination_id, verbose }) => {
      const r = await ft(auth, "POST", `/destinations/${destination_id}/test`, undefined, undefined, verbose ? undefined : "Destination test completed.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // ─── User & Team Management (3 tools) ──────────────────────────────

  // 19. List Users
  server.tool(
    "list_users",
    "List all users in the Fivetran account.",
    {
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const r = await ft(auth, "GET", "/users", params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 20. Invite User
  server.tool(
    "invite_user",
    "Invite a new user to the Fivetran account with a specified role. Returns compact confirmation by default — set verbose=true for full response.",
    {
      email: z.string().describe("User's email address"),
      given_name: z.string().describe("User's first name"),
      family_name: z.string().describe("User's last name"),
      role: z.string().optional().describe("Account-level role (use search to find /roles endpoint for options)"),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ email, given_name, family_name, role, verbose }) => {
      const body: Record<string, unknown> = { email, given_name, family_name };
      if (role) body.role = role;
      const r = await ft(auth, "POST", "/users", undefined, body, verbose ? undefined : "User invited successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 21. List Teams
  server.tool(
    "list_teams",
    "List all teams in the Fivetran account.",
    {
      limit: z.number().min(1).max(1000).default(100).optional().describe("Max results"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    async ({ limit = 100, cursor }) => {
      const params: Record<string, string> = { limit: String(limit) };
      if (cursor) params.cursor = cursor;
      const r = await ft(auth, "GET", "/teams", params);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // ─── Advanced Operations (2 tools) ─────────────────────────────────

  // 22. Resync Tables
  server.tool(
    "resync_tables",
    "Force a historical resync of specific tables within a connection. Only re-syncs the specified tables, not the entire connection. Returns compact confirmation by default — set verbose=true for full response.",
    {
      connection_id: z.string().describe("The connection ID"),
      tables: z.record(z.array(z.string())).describe('Object mapping schema names to arrays of table names, e.g. { "public": ["users", "orders"] }'),
      verbose: z.boolean().optional().describe(VERBOSE_DESC),
    },
    async ({ connection_id, tables, verbose }) => {
      const schemas: Record<string, { tables: Record<string, Record<string, never>> }> = {};
      for (const [schemaName, tableNames] of Object.entries(tables)) {
        const tablesObj: Record<string, Record<string, never>> = {};
        for (const tableName of tableNames) {
          tablesObj[tableName] = {};
        }
        schemas[schemaName] = { tables: tablesObj };
      }
      const r = await ft(auth, "POST", `/connections/${connection_id}/schemas/tables/resync`, undefined, { schemas }, verbose ? undefined : "Table resync triggered successfully.");
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );

  // 23. Get Connector Metadata
  server.tool(
    "get_connector_metadata",
    "Get available connector types and their configuration schemas. Use this to discover what connectors Fivetran supports and what config each requires.",
    {
      service: z.string().optional().describe("Specific connector type to get config schema for (e.g., 'google_sheets', 'postgres'). Omit to list all available types."),
    },
    async ({ service }) => {
      const path = service
        ? `/metadata/connector-config-schema/${service}`
        : "/metadata/connectors";
      const r = await ft(auth, "GET", path);
      return { content: [{ type: "text" as const, text: r.text }], isError: r.isError };
    }
  );
}
