type Env = {
  DB: D1Database;
  XAMAN_CLIENT_ID?: string;
  XAMAN_CLIENT_SECRET?: string;
  XAMAN_AUTHORIZE_URL?: string;
  XAMAN_TOKEN_URL?: string;
  XAMAN_USERINFO_URL?: string;
  XRPL_FLOW_SESSION_SECRET?: string;
  PUBLIC_API_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_FREE_MODEL?: string;
  XRPL_FREE_TIER_RPC_URL?: string;
  AI_FREE_DAILY_LIMIT?: string;
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

type ChatMessage = { role: "user" | "assistant"; text: string };
type XrplKnowledgeSnippet = { id: string; title: string; keywords: string[]; sourceUrl: string; body: string };

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FREE_AI_DEFAULT_MODEL = "gpt-5.4-mini";
const FREE_AI_DEFAULT_DAILY_LIMIT = 5;
const MIN_FREE_TIER_BALANCE_DROPS = 5_000_000;
const MAX_AI_BODY_BYTES = 80_000;
const MAX_AI_CONTEXT_BYTES = 16_000;
const MAX_WORKFLOW_NODES = 500;
const MAX_WORKFLOW_EDGES = 1000;
const encoder = new TextEncoder();
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();
const SAFE_NODE_TYPES = new Set([
  "ManualTrigger", "AccountEventTrigger",
  "AccountInfoQuery", "AccountLinesQuery", "AccountTxQuery", "AccountObjectsQuery", "LedgerQuery", "TxQuery", "NFTInfoQuery", "NFTHistoryQuery", "NFTsByIssuerQuery", "RawLedgerQuery",
  "PickOutput", "FilterItems", "DedupeItems", "AccumulateItems", "FormatTrustLines", "ExportCsv",
  "AccountSet", "AccountDelete", "SetRegularKey", "SignerListSet", "DepositPreauth", "TicketCreate", "DelegateSet", "Payment", "EscrowCreate", "EscrowFinish", "EscrowCancel",
  "PaymentChannelCreate", "PaymentChannelFund", "PaymentChannelClaim", "TrustSet", "OfferCreate", "OfferCancel", "Clawback", "AMMCreate", "AMMDeposit", "AMMWithdraw", "AMMVote", "AMMBid", "AMMDelete", "AMMClawback",
  "MPTokenIssuanceCreate", "MPTokenIssuanceDestroy", "MPTokenIssuanceSet", "MPTokenAuthorize", "CredentialCreate", "CredentialAccept", "CredentialDelete", "PermissionedDomainSet", "PermissionedDomainDelete",
  "DIDSet", "DIDDelete", "OracleSet", "OracleDelete", "NFTokenMint", "NFTokenBurn", "NFTokenCreateOffer", "NFTokenCancelOffer", "NFTokenAcceptOffer", "NFTokenModify",
  "CheckCreate", "CheckCash", "CheckCancel", "VaultCreate", "VaultSet", "VaultDeposit", "VaultWithdraw", "VaultDelete", "VaultClawback",
  "LoanBrokerSet", "LoanBrokerDelete", "LoanBrokerCoverDeposit", "LoanBrokerCoverWithdraw", "LoanBrokerCoverClawback", "LoanSet", "LoanPay", "LoanManage", "LoanDelete",
  "ConditionBranch", "ParallelSplit", "SyncJoin", "LoopContainer", "Delay", "LogOutput",
]);
const XRPL_KNOWLEDGE_SNIPPETS: XrplKnowledgeSnippet[] = [
  {
    id: "payment-swaps",
    title: "Payment, swaps, and currency conversion",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/payment",
    keywords: ["payment", "pay", "swap", "amm swap", "currency conversion", "cross-currency", "cross currency", "path", "paths", "sendmax", "delivermax", "delivermin", "slippage", "dex", "rlusd"],
    body: "Use Payment for XRP transfers, token transfers, MPT sends, cross-currency payments, and most swap/currency-conversion requests. A swap is not AMMDeposit. For a same-account swap, Destination is usually the sender account, Amount/DeliverMax is the asset to receive, and SendMax is the maximum asset to spend. Leave Paths empty unless explicit paths are supplied; rippled can use the default path through order books and AMMs. Use tfPartialPayment with DeliverMin only for slippage/min-receive flows.",
  },
  {
    id: "amm-liquidity",
    title: "AMM transactions are liquidity operations",
    sourceUrl: "https://xrpl.org/docs/concepts/tokens/decentralized-exchange/automated-market-makers",
    keywords: ["amm", "liquidity", "pool", "lp token", "lp", "deposit liquidity", "withdraw liquidity", "ammdeposit", "ammwithdraw", "ammcreate", "ammvote", "ammbid"],
    body: "AMMCreate creates an AMM pool. AMMDeposit adds liquidity and receives LP tokens. AMMWithdraw removes liquidity. AMMVote changes the trading fee. AMMBid bids for the auction slot. These are not token swaps; swap and buy/sell wording should normally become Payment/currency conversion unless the user explicitly asks to provide or remove liquidity.",
  },
  {
    id: "offers-dex",
    title: "DEX offers and order placement",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/offercreate",
    keywords: ["offer", "order", "limit order", "dex order", "order book", "offercreate", "offercancel", "buy", "sell", "market maker"],
    body: "Use OfferCreate to place a DEX offer/limit order and OfferCancel to cancel it. Use Payment for an immediate conversion/swap that consumes liquidity. OfferCreate is for standing offers; Payment is for sending/delivering value now.",
  },
  {
    id: "trust-lines",
    title: "Trust lines for issued tokens",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/trustset",
    keywords: ["trustline", "trust line", "trustset", "issued token", "iou", "issuer", "rippling", "freeze", "authorization", "receive token"],
    body: "Issued-token holders usually need a TrustSet before receiving a token. TrustSet creates or modifies a trust line, including limit, issuer, no-ripple/freeze flags, and authorization-related settings. Token sends still use Payment after trust lines exist.",
  },
  {
    id: "nfts",
    title: "NFT lifecycle",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint",
    keywords: ["nft", "nftoken", "mint nft", "sell nft", "buy nft", "nft offer", "burn nft", "nftokenmint", "nftokencreateoffer", "nftokenacceptoffer", "nftokencanceloffer"],
    body: "Use NFTokenMint to mint, NFTokenBurn to burn, NFTokenCreateOffer to list/bid, NFTokenAcceptOffer to accept, and NFTokenCancelOffer to cancel NFT offers. NFTInfoQuery, NFTHistoryQuery, and NFTsByIssuerQuery are Clio-oriented read/query nodes.",
  },
  {
    id: "payments-controls",
    title: "Payment controls and safety",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/payment",
    keywords: ["partial payment", "delivered amount", "tfpartialpayment", "tflimitquality", "quality", "minimum receive", "limit quality", "invoice", "destination tag"],
    body: "For exact payments, avoid tfPartialPayment. For slippage/minimum-receive flows, set tfPartialPayment and DeliverMin. For quality/rate protection, use tfLimitQuality when the user gives a minimum acceptable rate. DestinationTag and InvoiceID are optional metadata fields for recipients and reconciliation.",
  },
  {
    id: "escrow-checks-channels",
    title: "Deferred and channel payments",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/escrowcreate",
    keywords: ["escrow", "check", "payment channel", "paymentchannel", "deferred", "conditional payment", "release", "finish escrow", "cash check", "claim channel"],
    body: "Use EscrowCreate/EscrowFinish/EscrowCancel for locked XRP with time or crypto-condition release. Use CheckCreate/CheckCash/CheckCancel for recipient-pulled deferred payments. Use PaymentChannelCreate/Fund/Claim for repeated off-ledger claims against an XRP channel.",
  },
  {
    id: "account-controls",
    title: "Account controls and signing",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/signerlistset",
    keywords: ["multisign", "multi-sign", "signer", "signerlistset", "regular key", "setregularkey", "accountset", "deposit preauth", "ticket", "permission", "delegate"],
    body: "Use SignerListSet for multisigning setup, SetRegularKey for a regular key, AccountSet for account flags/domain/email/message-key settings, DepositPreauth for deposit authorization, TicketCreate for tickets, and DelegateSet for permission delegation when supported.",
  },
  {
    id: "queries-pagination",
    title: "Queries, Clio, and pagination",
    sourceUrl: "https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines",
    keywords: ["query", "account_lines", "account tx", "account objects", "ledger", "clio", "marker", "pagination", "holders", "trustlines", "csv", "history"],
    body: "Use query nodes for read-only workflows. Paginated XRPL responses return marker; keep markerEndpoint with marker and loop until marker is absent. For holder exports, use AccountLinesQuery in a LoopContainer, AccumulateItems, FormatTrustLines, then ExportCsv. NFT history/issuer queries are Clio-only style workflows.",
  },
  {
    id: "agent-safety",
    title: "Agentic workflow safety",
    sourceUrl: "https://xrpl.org/docs/agents/agentic-transactions",
    keywords: ["agent", "agentic", "automation", "budget", "telemetry", "source tag", "controls", "approval", "safe", "guard"],
    body: "For agentic/automated workflows, prefer testnet/devnet, explicit spend limits, review steps, source/destination tags for telemetry when useful, and clear stop conditions. Use query/branch guards before transaction nodes when the user asks for conditional execution.",
  },
  {
    id: "vault-loan-lifecycle",
    title: "Vault and loan lifecycle",
    sourceUrl: "https://xrpl.org/docs/references/protocol/transactions/types/vaultcreate",
    keywords: ["loan", "loans", "lending", "borrow", "borrower", "lender", "manager", "loan manager", "loan broker", "loanbrokerset", "loanset", "loanpay", "loanmanage", "vault", "vaultcreate", "vaultdeposit", "vaultwithdraw", "drawdown", "principal", "lifecycle", "3 parties", "three parties"],
    body: "For an end-to-end lending/vault lifecycle, do not replace protocol actions with generic Payment nodes. Use Devnet-only Vault and Lending Protocol nodes. A complete skeleton should include: ManualTrigger -> VaultCreate by protocol owner/manager -> LoanBrokerSet using the new VaultID -> optional LoanBrokerCoverDeposit for first-loss cover -> VaultDeposit by lender to provide liquidity -> LoanSet for borrower loan agreement using LoanBrokerID and Counterparty borrower -> LoanPay for borrower repayment -> optional LoanManage for default/impair/unimpair -> optional VaultWithdraw for lender withdrawal -> optional LoanDelete/LoanBrokerDelete/VaultDelete cleanup after repayment and empty balances. VaultCreate creates the Vault, share issuance, and pseudo-account; VaultDeposit moves assets into the vault and issues shares; LoanBrokerSet creates/updates a broker associated with a Vault; LoanSet creates the loan agreement and requires broker/borrower counterparty details and may require signature coordination. Leave VaultID, LoanBrokerID, and LoanID blank placeholders until prior transactions produce actual IDs, and explain those handoffs in the assistant message.",
  },
];

const AI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "workflow"],
  properties: {
    message: { type: "string", maxLength: 1000 },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["name", "nodes", "edges"],
      properties: {
        name: { type: "string", maxLength: 100 },
        nodes: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "type", "label", "configJson", "parentId", "x", "y"],
            properties: {
              id: { type: "string", maxLength: 80 },
              type: { type: "string", maxLength: 80 },
              label: { type: "string", maxLength: 100 },
              configJson: { type: "string", maxLength: 4000 },
              parentId: { type: ["string", "null"], maxLength: 80 },
              x: { type: "number" },
              y: { type: "number" },
            },
          },
        },
        edges: {
          type: "array",
          maxItems: 200,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "source", "target", "sourceHandle"],
            properties: {
              id: { type: "string", maxLength: 80 },
              source: { type: "string", maxLength: 80 },
              target: { type: "string", maxLength: 80 },
              sourceHandle: { type: ["string", "null"], maxLength: 20 },
            },
          },
        },
      },
    },
  },
} as const;

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
  const secret = env.XRPL_FLOW_SESSION_SECRET?.trim();
  if (!secret) throw new Error("XRPL_FLOW_SESSION_SECRET is not configured.");
  return secret;
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
  if (!env.XRPL_FLOW_SESSION_SECRET?.trim()) return null;
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
  if (!env.XRPL_FLOW_SESSION_SECRET?.trim()) return null;
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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function freeDailyLimit(env: Env): number {
  const configured = Number(env.AI_FREE_DAILY_LIMIT || "");
  return Number.isFinite(configured) && configured > 0 ? Math.min(50, Math.floor(configured)) : FREE_AI_DEFAULT_DAILY_LIMIT;
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item): ChatMessage[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const role = record["role"] === "assistant" ? "assistant" : record["role"] === "user" ? "user" : null;
    const text = typeof record["text"] === "string" ? record["text"].trim().slice(0, 4000) : "";
    return role && text ? [{ role, text }] : [];
  });
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function rateLimitHeaders(limit: number, remaining: number, resetAt: number): HeadersInit {
  return {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(Math.max(0, remaining)),
    "RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
}

function memoryRateLimit(key: string, windowMs: number, max: number): Response | null {
  const now = Date.now();
  const existing = memoryRateLimits.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  memoryRateLimits.set(key, bucket);
  if (bucket.count > max) {
    return json({ error: "Rate limit exceeded. Please slow down and try again." }, {
      status: 429,
      headers: rateLimitHeaders(max, 0, bucket.resetAt),
    });
  }
  return null;
}

async function rateLimit(env: Env, request: Request, options: { keyPrefix: string; windowMs: number; max: number }): Promise<Response | null> {
  const now = Date.now();
  const resetAt = now + options.windowMs;
  const key = `${options.keyPrefix}:${clientIp(request)}`;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at INTEGER NOT NULL
      )`,
    ).run();
    const updated = await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, reset_at)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
    ).bind(key, resetAt, now, now).first<{ count: number; reset_at: number }>();
    const count = Number(updated?.count || 1);
    const bucketReset = Number(updated?.reset_at || resetAt);
    if (count > options.max) {
      return json({ error: "Rate limit exceeded. Please slow down and try again." }, {
        status: 429,
        headers: rateLimitHeaders(options.max, 0, bucketReset),
      });
    }
    return null;
  } catch {
    return memoryRateLimit(key, options.windowMs, options.max);
  }
}

async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new Error("REQUEST_BODY_TOO_LARGE");
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function boundedJson(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  return text.length > MAX_AI_CONTEXT_BYTES ? `${text.slice(0, MAX_AI_CONTEXT_BYTES)} [truncated]` : text;
}

function scoreXrplKnowledge(snippet: XrplKnowledgeSnippet, text: string): number {
  let score = 0;
  for (const keyword of snippet.keywords) {
    const normalized = keyword.toLowerCase();
    if (!normalized) continue;
    if (text.includes(normalized)) score += normalized.includes(" ") ? 5 : 2;
  }
  if (text.includes(snippet.id.replace(/-/g, " "))) score += 4;
  return score;
}

function formatXrplKnowledge(context: unknown, limit = 5): string {
  const text = JSON.stringify(context ?? "").toLowerCase();
  const snippets = XRPL_KNOWLEDGE_SNIPPETS
    .map(snippet => ({ snippet, score: scoreXrplKnowledge(snippet, text) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.snippet.title.localeCompare(b.snippet.title))
    .slice(0, limit)
    .map(item => item.snippet);
  if (snippets.length === 0) return "No specific XRPL docs context matched. Use the node registry and ask the user to fill missing XRPL details.";
  return snippets.map(snippet => `- ${snippet.title}: ${snippet.body} Source: ${snippet.sourceUrl}`).join("\n");
}

function buildAiInstructions(registryContext: unknown, currentGraph: unknown, prompt: string, messages: ChatMessage[]): string {
  const xrplDocsContext = formatXrplKnowledge({ prompt, messages, currentGraph });
  return `You design safe XRPL Flow v2 workflow graphs. Return a useful short message and a complete workflow. Use only registry node types. Never use XChain, LedgerStateFix, or BatchContainer. Exactly one trigger is required. Ordinary nodes have at most one outgoing edge; branching uses ConditionBranch or ParallelSplit. Condition edges must use sourceHandle "true" or "false". Every other edge, including every ParallelSplit edge, must set sourceHandle to null. ParallelSplit needs at least two branches. Container children use parentId and have no graph edges. Batch is coming soon and disabled, including on Devnet. Loop children execute in position order from left to right / top to bottom, then the LoopContainer continues downstream once.

XRPL transaction selection knowledge:
- When the user asks for an end-to-end lifecycle, include the concrete protocol transaction nodes for setup, execution, repayment/settlement, and cleanup. Do not collapse protocol-specific actions into generic Payment or LogOutput nodes.
- For Devnet-only protocol features such as Vaults and Lending Protocol, use the matching Devnet-only nodes and leave required IDs blank when they are produced by earlier transactions. Explain those ID handoffs in the assistant message.
- AMM swap, token swap, swap XRP for token, swap token for XRP, buy/sell through AMM/DEX, or currency conversion should normally use Payment, not AMMDeposit. In XRPL, swaps are path/cross-currency Payments that can consume offers and AMM liquidity.
- For a swap/currency conversion where the sender receives the output asset, set Payment Destination to the sender account. Set Amount or DeliverMax to the desired receive asset and SendMax to the maximum spend asset. Leave Paths empty unless the user provides explicit paths; rippled can choose the default path.
- Use tfPartialPayment plus DeliverMin only when the user asks for slippage tolerance or "receive at least". Use tfLimitQuality when the user gives a minimum acceptable quality/rate. Do not set tfPartialPayment for normal exact-delivery transfers.
- AMMDeposit adds liquidity to a pool and mints LP tokens. AMMWithdraw removes liquidity. AMMCreate creates a pool. AMMVote changes the trading fee. AMMBid bids for the auction slot. These are not swaps.
- Place limit orders with OfferCreate and cancel with OfferCancel. Create trust lines with TrustSet before token receives when needed. Send tokens, XRP, and MPTs with Payment. NFT trades use NFTokenCreateOffer, NFTokenAcceptOffer, and NFTokenCancelOffer.
- For airdrops, prefer query or CSV preparation first; only build actual Payment loops when the user explicitly asks to submit transactions, and keep them testnet/devnet unless they clearly request mainnet.
- If issuer, currency, destination, rate, or amount is unknown, leave the specific field blank and explain what the user must fill in.
- JSON textarea fields must contain valid JSON only. Never put prose directly in Memos, SignerEntries, NFTokenOffers, Paths, Permissions, PriceDataSeries, CredentialIDs, or RequestJson. For human-readable memos, use XRPL Memo JSON, e.g. [{"Memo":{"MemoData":"68656C6C6F"}}] where MemoData is UTF-8 hex.

Relevant XRPL docs context selected for this request:
${xrplDocsContext}

Query and data-flow guidance:
- Prefer Ledger Query nodes for read-only workflows. Query-only workflows do not require a wallet.
- For trustline holder exports, use AccountLinesQuery -> FormatTrustLines -> ExportCsv.
- For pagination, XRPL returns marker. Put AccountLinesQuery and AccumulateItems inside a LoopContainer. AccountLinesQuery should use Marker "{{output.data.marker}}" and MarkerEndpoint "{{output.data.markerEndpoint}}". AccumulateItems should preserve marker and markerEndpoint. The LoopContainer should use LoopMode "until-condition", a bounded Iterations value, and Condition "!output.data.marker".
- MarkerEndpoint matters because a marker from one endpoint should be continued on that same endpoint.
- For friendly CSVs, use ExportCsv Columns like "holder=holder,balance=balance,currency=currency" or newline-separated mappings.
- For issuer-holder snapshots, use FormatTrustLines with Perspective "issuer", AbsoluteBalances true, IncludeZeroBalances false.
- For one-page account trustline exports, AccountLinesQuery Limit 200 is fine; for all holders, use the loop pattern above.
- Clio-only NFT methods include NFTInfoQuery, NFTHistoryQuery, and NFTsByIssuerQuery; keep LedgerIndex as "validated" unless the user gives a specific validated ledger.
- Loop wiring is strict: graph edges may connect to or from the LoopContainer node itself, but never to or from nodes that have parentId. Child nodes run only by containment order. For "repeat every N minutes", set LoopContainer DelayBetween to N minutes in milliseconds, e.g. 300000 for 5 minutes, and keep contained nodes edge-free.
- For one-time waiting such as "wait 1 minute then repay", use a Delay node with DelayMode "ms" and Duration 60000. Use LoopContainer DelayBetween only for repeated checks, polling, or repeated execution.

Leave unknown addresses/hashes as empty strings and explain what the user must fill in. Amount config objects use {"type":"xrp","drops":"..."}, {"type":"token","currency":"USD","issuer":"","value":"..."}, or {"type":"mpt","issuanceId":"","value":"..."}. Each configJson must itself be a valid serialized JSON object. Lay nodes out left-to-right with generous spacing. Available registry: ${boundedJson(registryContext)}. Current workflow, which may be replaced or adapted if relevant: ${boundedJson(currentGraph)}.`;
}

async function xrplRpc(env: Env, requestBody: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(env.XRPL_FREE_TIER_RPC_URL || "https://s1.ripple.com:51234/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(`XRPL account check failed with HTTP ${response.status}.`);
  const payload = await response.json() as { result?: Record<string, any> };
  return payload.result || {};
}

async function isFreeAiEligible(env: Env, address: string): Promise<boolean> {
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) return false;
  try {
    const accountInfo = await xrplRpc(env, {
      method: "account_info",
      params: [{ account: address, ledger_index: "validated" }],
    });
    const balanceDrops = Number(accountInfo.account_data?.Balance || 0);
    if (!Number.isFinite(balanceDrops) || balanceDrops < MIN_FREE_TIER_BALANCE_DROPS) return false;

    const accountTx = await xrplRpc(env, {
      method: "account_tx",
      params: [{ account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 1 }],
    });
    return Array.isArray(accountTx.transactions) && accountTx.transactions.length > 0;
  } catch {
    return false;
  }
}

async function consumeFreeAiQuota(env: Env, address: string): Promise<{ ok: true; used: number; remaining: number; limit: number } | { ok: false; limit: number }> {
  const limit = freeDailyLimit(env);
  const usageDate = todayUtc();
  const updated = await env.DB.prepare(
    `INSERT INTO ai_usage (address, usage_date, count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(address, usage_date) DO UPDATE SET
       count = ai_usage.count + 1,
       updated_at = excluded.updated_at
     WHERE ai_usage.count < ?
     RETURNING count`,
  ).bind(address, usageDate, Date.now(), limit).first<{ count: number }>();
  const next = Number(updated?.count || 0);
  if (!next || next > limit) return { ok: false, limit };
  return { ok: true, used: next, remaining: Math.max(0, limit - next), limit };
}

async function readFreeAiUsage(env: Env, address: string): Promise<{ used: number; remaining: number; limit: number }> {
  const limit = freeDailyLimit(env);
  const usageDate = todayUtc();
  const existing = await env.DB.prepare(
    "SELECT count FROM ai_usage WHERE address = ? AND usage_date = ?",
  ).bind(address, usageDate).first<{ count: number }>();
  const used = Math.max(0, Number(existing?.count || 0));
  return { used, remaining: Math.max(0, limit - used), limit };
}

async function hasFreeAiQuota(env: Env, address: string): Promise<{ ok: true; usage: { used: number; remaining: number; limit: number } } | { ok: false; usage: { used: number; remaining: number; limit: number } }> {
  const usage = await readFreeAiUsage(env, address);
  return usage.remaining > 0 ? { ok: true, usage } : { ok: false, usage };
}

function extractOpenAiOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return "";
}

async function getFreeAiUsage(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in with Xaman to view your free AI messages." }, { status: 401 });
  return json({ usage: await readFreeAiUsage(env, user.address) });
}

async function createFreeAiWorkflow(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Sign in with Xaman to use the free AI beta allowance." }, { status: 401 });
  if (!env.OPENAI_API_KEY?.trim()) return json({ error: "Free AI is not configured yet." }, { status: 501 });
  let body: Record<string, unknown> | null;
  try {
    body = await readJsonBody(request, MAX_AI_BODY_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
      return json({ error: "AI request is too large. Please shorten the prompt or current workflow context." }, { status: 413 });
    }
    return json({ error: "Invalid AI request." }, { status: 400 });
  }
  const prompt = typeof body?.["prompt"] === "string" ? body["prompt"].trim().slice(0, 4000) : "";
  if (!prompt) return json({ error: "Prompt is required." }, { status: 400 });
  const messages = sanitizeMessages(body?.["messages"]);
  const instructions = buildAiInstructions(body?.["registryContext"], body?.["currentGraph"], prompt, messages);
  const available = await hasFreeAiQuota(env, user.address);
  if (!available.ok) return json({ error: `Daily free AI limit reached. You get ${available.usage.limit} messages per day.`, usage: available.usage }, { status: 429 });
  const eligible = await isFreeAiEligible(env, user.address);
  if (!eligible) {
    return json({ error: "Sorry, your account is flagged by our systems and hence we cannot give you the free 5 AI messages." }, { status: 403 });
  }
  const quota = await consumeFreeAiQuota(env, user.address);
  if (!quota.ok) return json({ error: `Daily free AI limit reached. You get ${quota.limit} messages per day.`, usage: { limit: quota.limit, remaining: 0 } }, { status: 429 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_FREE_MODEL || FREE_AI_DEFAULT_MODEL,
      instructions,
      input: [...messages.map(message => ({ role: message.role, content: message.text })), { role: "user", content: prompt }],
      max_output_tokens: 3000,
      text: { format: { type: "json_schema", name: "xrpl_workflow", strict: true, schema: AI_RESPONSE_SCHEMA } },
    }),
  });
  const aiPayload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    return json({ error: "The free AI assistant could not generate a workflow. Please try again in a moment.", usage: quota }, { status: 502 });
  }
  const outputText = extractOpenAiOutputText(aiPayload);
  try {
    return json({ ...JSON.parse(outputText), usage: quota });
  } catch {
    return json({ error: "The free AI assistant returned invalid workflow JSON.", usage: quota }, { status: 502 });
  }
}

function validateWorkflowDocument(value: unknown): { ok: true; workflow: unknown } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Workflow must be an object." };
  const record = value as Record<string, unknown>;
  if (record["version"] !== 2) return { ok: false, error: "Only XRPL Flow v2 workflows can be published." };
  if (typeof record["name"] !== "string" || !Array.isArray(record["nodes"]) || !Array.isArray(record["edges"])) {
    return { ok: false, error: "Workflow is missing name, nodes, or edges." };
  }
  if ((record["nodes"] as unknown[]).length === 0) {
    return { ok: false, error: "Workflow must contain at least one node before publishing." };
  }
  const nodes = record["nodes"] as unknown[];
  const edges = record["edges"] as unknown[];
  if (nodes.length > MAX_WORKFLOW_NODES || edges.length > MAX_WORKFLOW_EDGES) {
    return { ok: false, error: `Workflow is too large to publish. Limit ${MAX_WORKFLOW_NODES} nodes and ${MAX_WORKFLOW_EDGES} edges.` };
  }
  const size = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (size > 1_000_000) return { ok: false, error: "Workflow is too large to publish." };
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return { ok: false, error: "Workflow contains an invalid node." };
    const item = node as Record<string, unknown>;
    const id = typeof item["id"] === "string" ? item["id"] : "";
    const type = typeof item["type"] === "string" ? item["type"] : "";
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || ids.has(id)) return { ok: false, error: "Workflow contains an invalid or duplicate node id." };
    if (type === "BatchContainer") return { ok: false, error: "Batch templates are disabled until Batch is live." };
    if (!SAFE_NODE_TYPES.has(type)) return { ok: false, error: `Workflow contains unsupported node type: ${type || "unknown"}.` };
    ids.add(id);
    const data = item["data"];
    if (data !== undefined && (!data || typeof data !== "object" || Array.isArray(data))) return { ok: false, error: "Workflow contains invalid node data." };
  }
  for (const edge of edges) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) return { ok: false, error: "Workflow contains an invalid edge." };
    const item = edge as Record<string, unknown>;
    const source = typeof item["source"] === "string" ? item["source"] : "";
    const target = typeof item["target"] === "string" ? item["target"] : "";
    if (!ids.has(source) || !ids.has(target)) return { ok: false, error: "Workflow contains an edge that references a missing node." };
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
  return json({ templates });
}

async function publishMarketplace(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Authentication required" }, { status: 401 });
  let body: Record<string, unknown> | null;
  try {
    body = await readJsonBody(request, 1_100_000);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") return json({ error: "Workflow is too large to publish." }, { status: 413 });
    return json({ error: "Invalid marketplace publish request." }, { status: 400 });
  }
  const workflowValidation = validateWorkflowDocument(body?.workflow);
  if (!workflowValidation.ok) return json({ error: workflowValidation.error }, { status: 400 });
  const name = String(body?.name || (workflowValidation.workflow as Record<string, unknown>)["name"] || "").trim().slice(0, 100);
  const description = String(body?.description || "").trim().slice(0, 500);
  const authorName = String(body?.authorName || user.displayName || user.address).trim().slice(0, 80);
  const tags = cleanTags(body?.tags);
  if (!name) return json({ error: "Template name is required." }, { status: 400 });
  if (!description) return json({ error: "Template description is required." }, { status: 400 });
  if ([name, ...tags].some(value => /batch/i.test(value))) return json({ error: "Batch templates are disabled until Batch is live." }, { status: 400 });
  if (tags.length === 0) return json({ error: "Add at least one marketplace tag." }, { status: 400 });

  const now = Date.now();
  const template: MarketplaceTemplate = {
    id: crypto.randomUUID(),
    name,
    description,
    tags,
    authorAddress: user.address,
    authorName: authorName || user.address,
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
  return json({ template }, { status: 201 });
}

async function deleteMarketplace(env: Env, request: Request, id: string): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ error: "Authentication required" }, { status: 401 });
  if (!id) return json({ error: "Template id is required." }, { status: 400 });
  const existing = await env.DB.prepare(
    `SELECT id FROM marketplace_templates WHERE id = ? AND author_address = ? AND published = 1 LIMIT 1`,
  ).bind(id, user.address).first<{ id: string }>();
  if (!existing) return json({ error: "Template not found for this account." }, { status: 404 });
  await env.DB.prepare(
    `UPDATE marketplace_templates
     SET published = 0, updated_at = ?
     WHERE id = ? AND author_address = ? AND published = 1`,
  ).bind(Date.now(), id, user.address).run();
  return json({ ok: true });
}

async function startXaman(env: Env, request: Request): Promise<Response> {
  if (!env.XAMAN_CLIENT_ID || !env.XRPL_FLOW_SESSION_SECRET?.trim()) {
    return json({ error: "Xaman OAuth is not configured. Set XAMAN_CLIENT_ID, XAMAN_CLIENT_SECRET, and XRPL_FLOW_SESSION_SECRET." }, { status: 501 });
  }
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
  if (!env.XAMAN_CLIENT_ID || !env.XAMAN_CLIENT_SECRET || !env.XRPL_FLOW_SESSION_SECRET?.trim()) {
    return new Response("Xaman OAuth is not configured.", { status: 501 });
  }
  const state = await verifySignedState<{ returnTo?: string }>(env, url.searchParams.get("state") || undefined);
  if (!code || !state) {
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
  return new Response(null, {
    status: 302,
    headers: {
      location: returnTo,
      "set-cookie": `xrpl_flow_session=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "");

  try {
    if (request.method === "GET" && route === "health") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "health", windowMs: 60_000, max: 120 });
      return limited || json({ ok: true });
    }
    if (request.method === "GET" && route === "auth/me") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "auth-me", windowMs: 60_000, max: 120 });
      return limited || json({ user: await currentUser(context.env, request) });
    }
    if (request.method === "GET" && route === "auth/xaman/start") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "xaman-start", windowMs: 60_000, max: 20 });
      return limited || startXaman(context.env, request);
    }
    if (request.method === "GET" && route === "auth/xaman/callback") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "xaman-callback", windowMs: 60_000, max: 30 });
      return limited || callbackXaman(context.env, request);
    }
    if (request.method === "GET" && route === "marketplace/templates") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "market-list", windowMs: 60_000, max: 120 });
      return limited || listMarketplace(context.env, request);
    }
    if (request.method === "POST" && route === "marketplace/templates") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "market-publish", windowMs: 60_000, max: 10 });
      return limited || publishMarketplace(context.env, request);
    }
    if (request.method === "DELETE" && route.startsWith("marketplace/templates/")) {
      const limited = await rateLimit(context.env, request, { keyPrefix: "market-delete", windowMs: 60_000, max: 30 });
      return limited || deleteMarketplace(context.env, request, route.slice("marketplace/templates/".length));
    }
    if (request.method === "GET" && route === "ai/usage") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "ai-usage", windowMs: 60_000, max: 60 });
      return limited || getFreeAiUsage(context.env, request);
    }
    if (request.method === "POST" && route === "ai/workflow") {
      const limited = await rateLimit(context.env, request, { keyPrefix: "ai-workflow", windowMs: 60_000, max: 20 });
      return limited || createFreeAiWorkflow(context.env, request);
    }
    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return json({ error: "Internal error" }, { status: 500 });
  }
};
