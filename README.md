# fivetran-mcp

**25 tools. 161 endpoints. Zero bloat.**

A hybrid Fivetran MCP server built on the architecture Cloudflare pioneered for their own API: instead of drowning the model in dozens of tool definitions, we give it 23 fast native tools for the data engineering workflow you actually use, plus two universal tools that unlock the entire Fivetran REST API on demand.

---

## The Problem with Every Other Fivetran MCP

Existing Fivetran MCP servers expose 13–20+ individual tools, each one permanently loaded into the LLM's context window. They still don't cover the full API — no transformations, no teams, no webhooks, no schema management depth. So you get the worst of both worlds: context overhead without completeness.

This is the **context flooding** problem. Cloudflare ran the math on their own API (2,500+ endpoints) and found that exposing everything as native MCP tools would consume **1.17 million tokens** per turn. Their solution was radical: collapse the entire API surface into just two tools — `search` and `execute` — and let the model discover what it needs on the fly. They called it [Code Mode](https://blog.cloudflare.com/code-mode-for-mcp/), and it reduced the footprint to ~1,000 tokens.

## Our Take: The Hybrid Architecture

Pure Code Mode is elegant, but it has a tradeoff. For the stuff you do every single day — check sync status, trigger a sync, list connections, pause a connector — forcing the model to search the API catalog first adds an unnecessary round trip. You already know what you want. The model should too.

So we built a hybrid:

**Layer 1: 23 native tools** for the complete data engineering workflow. These are purpose-built, zero-overhead, and handle the 80% case. Checking sync status, triggering a resync, managing schemas — one tool call, done. No searching, no discovering, no extra turns.

**Layer 2: `search` + `execute`** for everything else. An embedded catalog of all 161 Fivetran API endpoints, generated from the [official OpenAPI spec](https://fivetran.com/docs/rest-api/api-reference/open-api-definition). The model searches to discover endpoints, then executes to call them. Private links, proxy agents, system keys, custom connector SDKs — it's all there without adding a single extra tool definition.

The result: **25 tool schemas** in your context window instead of an incomplete subset. Fast for the common case, omnipotent for the edge case.

| | Other Fivetran MCPs | fivetran-mcp |
|---|---|---|
| **Tools in context** | 13–20+ | **25** |
| **API coverage** | Partial | **Full (161 endpoints)** |
| **Token cost per turn** | High (all schemas always loaded) | **Minimal** |
| **Common tasks** | Same overhead as rare ones | **Optimized native tools** |
| **New Fivetran endpoints** | Requires code changes | **Already covered via execute** |

---

## Setup

### Get Your Fivetran API Credentials

1. Log in to [Fivetran](https://fivetran.com)
2. Go to **Settings → API Key** (or click your username → API Key)
3. Generate a new API key — copy both the **Key** and the **Secret**

The secret is only shown once. Store it somewhere safe.

### Claude Code

Add to your `~/.claude.json` (or project-level `.claude.json`) under `mcpServers`:

```json
{
  "mcpServers": {
    "fivetran": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "fivetran-mcp"],
      "env": {
        "FIVETRAN_API_KEY": "your-api-key",
        "FIVETRAN_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

Restart Claude Code for the server to connect. You'll see `fivetran` in your MCP server list, and the tools will appear as `mcp__fivetran__list_connections`, `mcp__fivetran__search`, etc.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "fivetran": {
      "command": "npx",
      "args": ["-y", "fivetran-mcp"],
      "env": {
        "FIVETRAN_API_KEY": "your-api-key",
        "FIVETRAN_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

Restart Claude Desktop. The Fivetran tools will appear in the tools menu (hammer icon).

### Cursor / Windsurf / Other MCP Clients

The config pattern is the same — `npx -y fivetran-mcp` as the command, with your API key and secret in the `env` block. Consult your client's MCP documentation for where to place the config.

### Running from Source (Development)

If you cloned the repo instead of using npx:

```json
{
  "mcpServers": {
    "fivetran": {
      "command": "node",
      "args": ["/path/to/fivetran-mcp/dist/index.js"],
      "env": {
        "FIVETRAN_API_KEY": "your-api-key",
        "FIVETRAN_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

---

## Native Tools: The Fast Path

These 23 tools cover the complete data engineering lifecycle — no searching required:

### Connection Management

| Tool | What it does |
|------|-------------|
| `list_connections` | List all connections with sync status, optionally filtered by group |
| `get_connection_details` | Get full config, status, schedule for a specific connection |
| `create_connection` | Create a new connector (use `get_connector_metadata` to discover types) |
| `update_connection` | Update connection config, schedule, or settings |
| `delete_connection` | Permanently delete a connection |
| `trigger_sync` | Trigger an immediate sync without waiting for schedule |
| `pause_connection` | Pause a connection's sync schedule |
| `resume_connection` | Resume a paused connection |

### Schema Management

| Tool | What it does |
|------|-------------|
| `get_connection_schema` | Get schema/table/column config with enabled/disabled state |
| `update_connection_schema` | Enable/disable schemas, tables, and columns |
| `reload_schema` | Refresh schema from source (detect new tables/columns) |

### Sync Monitoring

| Tool | What it does |
|------|-------------|
| `get_sync_status` | Current sync state, last sync time, warnings, failures |
| `get_table_status` | Per-table sync status flattened into a readable list |
| `get_sync_logs` | Connection state and sync history |

### Group & Destination Management

| Tool | What it does |
|------|-------------|
| `list_groups` | List all groups (workspaces) |
| `get_group_connectors` | List all connections within a group |
| `list_destinations` | List all destinations with config |
| `test_destination` | Run destination connectivity tests |

### User & Team Management

| Tool | What it does |
|------|-------------|
| `list_users` | List all account users |
| `invite_user` | Invite a new user with role |
| `list_teams` | List all teams |

### Advanced Operations

| Tool | What it does |
|------|-------------|
| `resync_tables` | Force historical resync of specific tables (not the whole connection) |
| `get_connector_metadata` | Discover available connector types and their required config |

### Example: Daily Data Engineering Workflow

```
1. list_groups()                              → find your workspace
2. get_group_connectors(group_id)             → see all connections
3. get_sync_status(connection_id)             → check if sync succeeded
4. get_table_status(connection_id)            → drill into table-level status
5. trigger_sync(connection_id)                → force a sync if needed
6. get_connection_schema(connection_id)       → inspect what's being synced
```

### Example: Resync Specific Tables

```
resync_tables(
  connection_id: "spoke_foolish",
  tables: { "public": ["users", "orders", "products"] }
)
```

---

## Universal Tools: The Long Tail

For anything beyond the 23 native tools — private links, proxy agents, system keys, custom connector SDKs, HVR registrations, and more — use `search` and `execute`.

### Search: Discover What's Available

Call with no arguments to see the full API map:

```
> search()

Fivetran REST API — 161 endpoints across 21 categories

  Account Management (1) — Account-level info and settings
  Certificate Management (17) — SSL certificate and fingerprint approval
  Connection Management (11) — Connectors — create, configure, sync, pause, resume, delete
  Connection Schema Management (11) — Schema, table, and column configuration
  Team Management (21) — Teams — membership, groups, connections, permissions
  User Management (16) — Users — invite, modify, delete, memberships
  ...
```

Narrow it down:

```
> search(tag: "Webhook Management")
> search(query: "schema reload")
> search(query: "proxy agent", method: "POST")
```

### Execute: Call Any Endpoint

```
> execute(method: "GET", path: "/account/info")
{ "account_id": "...", "account_name": "..." }

> execute(method: "GET", path: "/roles")

> execute(method: "POST", path: "/webhooks", body: {
    "url": "https://example.com/webhook",
    "events": ["sync_end"],
    "active": true
  })
```

---

## All 21 API Categories

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Account Management | 1 | Account-level info and settings |
| Certificate Management | 17 | SSL certificate and fingerprint approval |
| Connection Management | 11 | Connectors — create, configure, sync, pause, resume, delete |
| Connection Schema Management | 11 | Schema, table, and column configuration |
| Connector Metadata | 2 | Available connector types and config schemas |
| Connector SDK Package Resource | 6 | Custom connector SDK management |
| Destination Management | 6 | Data warehouse and lake destinations |
| Group Management | 11 | Groups — connectors, users, service accounts |
| HVR Registrations Management | 1 | HVR replication registrations |
| Hybrid Deployment Agent Management | 6 | On-premises deployment agents |
| Log Service Management | 10 | Sync logs and log service configuration |
| Private Link Management | 5 | Private networking (AWS/Azure/GCP) |
| Proxy Agent Management | 6 | Proxy agent configuration |
| Public Endpoints | 1 | Public API information |
| Role Management | 1 | Roles and permissions |
| System Key Management | 6 | System API key management |
| Team Management | 21 | Teams — membership, groups, connections, permissions |
| Transformation Management | 10 | dbt transformations — create, run, manage |
| Transformation Projects Management | 6 | dbt project management |
| User Management | 16 | Users — invite, modify, delete, memberships |
| Webhook Management | 7 | Webhooks — create, test, manage notifications |

---

## Development

```bash
git clone https://github.com/livemau5/fivetran-mcp.git
cd fivetran-mcp
npm install
npm run build

# Regenerate the API catalog from the latest Fivetran spec
npm run generate-catalog

# Run in development mode
FIVETRAN_API_KEY=your-key FIVETRAN_API_SECRET=your-secret npm run dev
```

### Project Structure

```
src/
  index.ts              Entry point — server setup, tool registration, stdio transport
  types.ts              CatalogEntry interface
  utils.ts              Auth header building, URL construction, response formatting
  api-catalog.ts        Auto-generated catalog of all 161 endpoints
  tools/
    native.ts           23 native tools for the data engineering workflow
    search.ts           Search tool — text/tag/method filtering over the catalog
    execute.ts          Execute tool — HTTP client with automatic Basic Auth
scripts/
  generate-catalog.ts   Parses official Fivetran OpenAPI spec into api-catalog.ts
```

## License

MIT
