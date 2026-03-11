const BASE_URL = "https://api.fivetran.com/v1";
const MAX_RESPONSE_BYTES = 50_000;
const COMPACT_RESPONSE_BYTES = 4_000;

export function buildAuthHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

export function buildUrl(
  path: string,
  params?: Record<string, string>
): string {
  // Normalize: strip leading /v1/ if accidentally included, ensure leading /
  let normalizedPath = path.replace(/^\/v1\/?/, "/");
  if (!normalizedPath.startsWith("/")) normalizedPath = `/${normalizedPath}`;
  const url = new URL(`${BASE_URL}${normalizedPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function unwrapData(body: unknown): unknown {
  if (typeof body === "object" && body !== null && "data" in body) {
    return (body as Record<string, unknown>).data;
  }
  return body;
}

export function formatResponse(data: unknown): string {
  const json = JSON.stringify(data, null, 2);
  if (json.length > MAX_RESPONSE_BYTES) {
    const truncated = json.slice(0, MAX_RESPONSE_BYTES);
    return (
      truncated +
      `\n\n... [Response truncated at ${MAX_RESPONSE_BYTES} bytes. Use "limit" and "cursor" query params to paginate.]`
    );
  }
  // Append cursor hint if present
  if (
    typeof data === "object" &&
    data !== null &&
    "next_cursor" in data &&
    (data as Record<string, unknown>).next_cursor
  ) {
    return (
      json +
      `\n\nMore results available. Pass cursor: "${(data as Record<string, unknown>).next_cursor}" for the next page.`
    );
  }
  return json;
}

/**
 * Summarize a write response into a compact confirmation.
 * Fivetran often returns the entire resource (e.g., full schema tree) on PATCH/POST.
 * This extracts just the key fields to avoid flooding the LLM context.
 */
export function summarizeWriteResponse(
  data: unknown,
  action: string
): string {
  if (typeof data !== "object" || data === null) {
    return `${action}: Success`;
  }
  const d = data as Record<string, unknown>;

  // Pick the most useful top-level fields
  const summary: Record<string, unknown> = {};
  const keepFields = [
    "id", "group_id", "service", "schema", "paused", "status",
    "sync_state", "setup_state", "schedule_type", "sync_frequency",
    "succeeded_at", "failed_at", "created_at", "name", "email",
    "connected_by", "service_version",
  ];
  for (const key of keepFields) {
    if (key in d) summary[key] = d[key];
  }

  // If there's a nested status object, flatten the key bits
  if (typeof d.status === "object" && d.status !== null) {
    const s = d.status as Record<string, unknown>;
    summary.status = {
      setup_state: s.setup_state,
      sync_state: s.sync_state,
      is_historical_sync: s.is_historical_sync,
    };
    if (Array.isArray(s.warnings) && s.warnings.length > 0) {
      summary.warnings_count = s.warnings.length;
    }
  }

  if (Object.keys(summary).length > 0) {
    return `${action}\n${JSON.stringify(summary, null, 2)}`;
  }

  // Fallback: truncate at compact limit
  const json = JSON.stringify(data, null, 2);
  if (json.length > COMPACT_RESPONSE_BYTES) {
    return `${action}\n${json.slice(0, COMPACT_RESPONSE_BYTES)}\n\n... [Truncated. Use get_connection_details or get_connection_schema for full data.]`;
  }
  return `${action}\n${json}`;
}

export function formatError(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const err = body as Record<string, unknown>;
    let msg = `Error ${status}: ${err.code ?? "Unknown error"}`;
    if (err.message) msg += `\n${err.message}`;
    if (status === 401)
      msg +=
        "\n\nHint: Check that FIVETRAN_API_KEY and FIVETRAN_API_SECRET are valid.";
    if (status === 403)
      msg +=
        "\n\nHint: Your API key may lack permissions for this operation. Check your Fivetran role.";
    if (status === 404)
      msg +=
        "\n\nHint: Resource not found. Verify the connection/group/user ID is correct.";
    if (status === 429)
      msg +=
        "\n\nRate limited. Fivetran allows ~500 requests/hour on trial plans. Wait and retry.";
    return msg;
  }
  return `Error ${status}: ${String(body)}`;
}
