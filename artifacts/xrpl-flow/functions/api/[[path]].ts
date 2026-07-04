type Env = {
  DB: D1Database;
  XAMAN_CLIENT_ID?: string;
  XAMAN_CLIENT_SECRET?: string;
  XAMAN_AUTHORIZE_URL?: string;
  XAMAN_TOKEN_URL?: string;
  XAMAN_USERINFO_URL?: string;
  XRPL_FLOW_SESSION_SECRET?: string;
  PUBLIC_API_BASE_URL?: string;
};

type MarketplaceUser = {
  address: string;
  displayName?: string;
};

type MarketplaceTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  authorAddress: string;
  authorName: string;
  workflow: unknown;
  createdAt: number;
  updatedAt: number;
};

type D1TemplateRow = {
  id: string;
  name: string;
  description: string;
  tags_json: string;
  author_address: string;
  author_name?: string | null;
  workflow_json: string;
  created_at: number;
  updated_at: number;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64url(new Uint8Array(signature));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function sessionSecret(env: Env): string {
  return env.XRPL_FLOW_SESSION_SECRET || "dev-only-change-me";
}

async function createSessionToken(env: Env, user: MarketplaceUser): Promise<string> {
  const encodedPayload = base64url(encoder.encode(JSON.stringify({
    sub: user.address,
    name: user.displayName || user.address,
    exp: Date.now() + SESSION_TTL_MS,
  })));
  return `${encodedPayload}.${await hmac(sessionSecret(env), encodedPayload)}`;
}

async function verifySessionToken(env: Env, token: string | undefined): Promise<MarketplaceUser | null> {
  if (!token || !token.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = await hmac(sessionSecret(env), encodedPayload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(encodedPayload))) as { sub?: string; name?: string; exp?: number };
    if (!payload.sub || !payload.exp || Date.now() > payload.exp) return null;
    return { address: payload.sub, displayName: payload.name };
  } catch {
    return null;
  }
}

async function signedState(env: Env, payload: Record<string, unknown>): Promise<string> {
  const encodedPayload = base64url(encoder.encode(JSON.stringify({ ...payload, iat: Date.now() })));
  return `${encodedPayload}.${await hmac(sessionSecret(env), encodedPayload)}`;
}

async function verifySignedState<T extends Record<string, unknown>>(env: Env, state: string | undefined, ttlMs = 10 * 60 * 1000): Promise<T | null> {
  if (!state || !state.includes(".")) return null;
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return null;
  const expected = await hmac(sessionSecret(env), encodedPayload);
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(encodedPayload))) as T & { iat?: number };
    if (!payload.iat || Date.now() - payload.iat > ttlMs) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

async function currentUser(env: Env, request: Request): Promise<MarketplaceUser | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : cookieValue(request, "xrpl_flow_session");
  return verifySessionToken(env, token);
}

function publicBaseUrl(env: Env, request: Request): string {
  return (env.PUBLIC_API_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function sanitizeReturnTo(value: string | null, request: Request): string {
  if (!value) return "/";
  try {
    const current = new URL(request.url);
    const url = new URL(value, current.origin);
    if (url.origin !== current.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean).slice(0, 12))].map(tag => tag.slice(0, 32));
}

function validateWorkflowDocument(value: unknown): { ok: true; workflow: unknown } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Workflow must be an object." };
  const record = value as Record<string, unknown>;
  if (record["version"] !== 2) return { ok: false, error: "Only XRPL Flow v2 workflows can be published." };
  if (typeof record["name"] !== "string" || !Array.isArray(record["nodes"]) || !Array.isArray(record["edges"])) {
    return { ok: false, error: "Workflow is missing name, nodes, or edges." };
  }
  const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (size > 1_000_000) return { ok: false, error: "Workflow is too large to publish." };
  if ((record["nodes"] as unknown[]).some(node => node && typeof node === "object" && (node as Record<string, unknown>)["type"] === "BatchContainer")) {
    return { ok: false, error: "Batch templates are disabled until Batch is live." };
  }
  return { ok: true, workflow: value };
}

function rowToTemplate(row: D1TemplateRow): MarketplaceTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    tags: JSON.parse(row.tags_json || "[]") as string[],
    authorAddress: row.author_address,
    authorName: row.author_name || row.author_address,
    workflow: JSON.parse(row.workflow_json),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

async function listMarketplace(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").toLowerCase().trim();
  const tag = String(url.searchParams.get("tag") || "").trim();
  const { results } = await env.DB.prepare(
    `SELECT
      t.id,
      t.name,
      t.description,
      t.tags_json,
      t.author_address,
      COALESCE(u.display_name, t.author_address) AS author_name,
      t.workflow_json,
      t.created_at,
      t.updated_at
    FROM marketplace_templates t
    LEFT JOIN marketplace_users u ON u.address = t.author_address
    WHERE t.published = 1
    ORDER BY t.updated_at DESC
    LIMIT 500`,
  ).all<D1TemplateRow>();
  const templates = results
    .map(rowToTemplate)
    .filter(item => ![item.name, ...item.tags].some(value => /batch/i.test(value)))
    .filter(item => !tag || item.tags.includes(tag))
    .filter(item => !q || [item.name, item.description, item.authorName, ...item.tags].join(" ").toLowerCase().includes(q))
    .slice(0, 100);
  return json({ templates, storage: "cloudflare-d1" });
}

async function publishMarketplace(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as any;
  const workflowValidation = validateWorkflowDocument(body?.workflow);
  if (!workflowValidation.ok) return json({ error: workflowValidation.error }, { status: 400 });
  const name = String(body?.name || (workflowValidation.workflow as Record<string, unknown>)["name"] || "").trim().slice(0, 100);
  const description = String(body?.description || "").trim().slice(0, 500);
  const tags = cleanTags(body?.tags);
  if (!name) return json({ error: "Template name is required." }, { status: 400 });
  if ([name, ...tags].some(value => /batch/i.test(value))) return json({ error: "Batch templates are disabled until Batch is live." }, { status: 400 });
  if (tags.length === 0) return json({ error: "Add at least one marketplace tag." }, { status: 400 });

  const now = Date.now();
  const template: MarketplaceTemplate = {
    id: crypto.randomUUID(),
    name,
    description,
    tags,
    authorAddress: user.address,
    authorName: user.displayName || user.address,
    workflow: workflowValidation.workflow,
    createdAt: now,
    updatedAt: now,
  };
  await env.DB.prepare(
    `INSERT INTO marketplace_users (address, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
  ).bind(template.authorAddress, template.authorName, now, now).run();
  await env.DB.prepare(
    `INSERT INTO marketplace_templates (
      id, name, description, tags_json, author_address, workflow_json, created_at, updated_at, published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(
    template.id,
    template.name,
    template.description,
    JSON.stringify(template.tags),
    template.authorAddress,
    JSON.stringify(template.workflow),
    template.createdAt,
    template.updatedAt,
  ).run();
  return json({ template, storage: "cloudflare-d1" }, { status: 201 });
}

async function startXaman(env: Env, request: Request): Promise<Response> {
  if (!env.XAMAN_CLIENT_ID) return json({ error: "Xaman OAuth is not configured. Set XAMAN_CLIENT_ID and XAMAN_CLIENT_SECRET." }, { status: 501 });
  const url = new URL(request.url);
  const redirectUri = `${publicBaseUrl(env, request)}/api/auth/xaman/callback`;
  const state = await signedState(env, { returnTo: sanitizeReturnTo(url.searchParams.get("returnTo"), request) });
  const authorizeUrl = new URL(env.XAMAN_AUTHORIZE_URL || "https://oauth2.xumm.app/auth");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.XAMAN_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "openid profile");
  authorizeUrl.searchParams.set("state", state);
  return json({ authorizationUrl: authorizeUrl.toString() });
}

async function callbackXaman(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = await verifySignedState<{ returnTo?: string }>(env, url.searchParams.get("state") || undefined);
  if (!env.XAMAN_CLIENT_ID || !env.XAMAN_CLIENT_SECRET || !code || !state) {
    return new Response("Invalid Xaman OAuth callback.", { status: 400 });
  }
  const redirectUri = `${publicBaseUrl(env, request)}/api/auth/xaman/callback`;
  const tokenResponse = await fetch(env.XAMAN_TOKEN_URL || "https://oauth2.xumm.app/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: env.XAMAN_CLIENT_ID,
      client_secret: env.XAMAN_CLIENT_SECRET,
    }),
  });
  if (!tokenResponse.ok) return new Response("Xaman token exchange failed.", { status: 502 });
  const tokenJson = await tokenResponse.json() as { access_token?: string };
  if (!tokenJson.access_token) return new Response("Xaman did not return an access token.", { status: 502 });
  const userResponse = await fetch(env.XAMAN_USERINFO_URL || "https://oauth2.xumm.app/userinfo", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userResponse.ok) return new Response("Xaman userinfo request failed.", { status: 502 });
  const userInfo = await userResponse.json() as Record<string, unknown>;
  const address = String(userInfo["account"] || userInfo["sub"] || "");
  if (!address) return new Response("Xaman profile did not include an account address.", { status: 502 });
  const session = await createSessionToken(env, { address, displayName: String(userInfo["name"] || address) });
  const returnTo = sanitizeReturnTo(String(state.returnTo || "/"), request);
  const joiner = returnTo.includes("?") ? "&" : "?";
  return new Response(null, {
    status: 302,
    headers: {
      location: `${returnTo}${joiner}xrplFlowSession=${encodeURIComponent(session)}`,
      "set-cookie": `xrpl_flow_session=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "");

  try {
    if (request.method === "GET" && route === "health") return json({ ok: true });
    if (request.method === "GET" && route === "auth/me") return json({ user: await currentUser(context.env, request) });
    if (request.method === "GET" && route === "auth/xaman/start") return startXaman(context.env, request);
    if (request.method === "GET" && route === "auth/xaman/callback") return callbackXaman(context.env, request);
    if (request.method === "GET" && route === "marketplace/templates") return listMarketplace(context.env, request);
    if (request.method === "POST" && route === "marketplace/templates") return publishMarketplace(context.env, request);
    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
};
