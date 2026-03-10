const BASE_URL = "https://api.fivetran.com/v1";
const MAX_RESPONSE_BYTES = 50_000;

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
