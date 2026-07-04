type D1Response<T> = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{ results?: T[] }>;
};

function d1Config() {
  const accountId = process.env["CLOUDFLARE_ACCOUNT_ID"];
  const databaseId = process.env["CLOUDFLARE_D1_DATABASE_ID"];
  const apiToken = process.env["CLOUDFLARE_API_TOKEN"];
  if (!accountId || !databaseId || !apiToken) return null;
  return { accountId, databaseId, apiToken };
}

export function isD1Configured(): boolean {
  return Boolean(d1Config());
}

export async function d1Query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const config = d1Config();
  if (!config) throw new Error("Cloudflare D1 is not configured.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const json = await response.json() as D1Response<T>;
  if (!response.ok || !json.success) {
    const detail = json.errors?.map(error => error.message).filter(Boolean).join("; ") || response.statusText;
    throw new Error(`Cloudflare D1 query failed: ${detail}`);
  }
  return json.result?.flatMap(item => item.results || []) || [];
}

