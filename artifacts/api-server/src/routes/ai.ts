import { Router } from "express";
import { requireAuth, type MarketplaceUser } from "../lib/auth";
import { d1Query, isD1Configured } from "../lib/d1";
import { rateLimit } from "../lib/rateLimit";
import { formatXrplKnowledge } from "../lib/xrplKnowledge";

type ChatMessage = { role: "user" | "assistant"; text: string };

const FREE_AI_DEFAULT_MODEL = "gpt-5.4-mini";
const FREE_AI_DEFAULT_DAILY_LIMIT = 5;
const MIN_FREE_TIER_BALANCE_DROPS = 5_000_000;
const MAX_AI_BODY_BYTES = 80_000;
const MAX_AI_CONTEXT_BYTES = 16_000;
const usage = new Map<string, number>();

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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function freeDailyLimit(): number {
  const configured = Number(process.env["AI_FREE_DAILY_LIMIT"] || "");
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

function boundedJson(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  return json.length > MAX_AI_CONTEXT_BYTES ? `${json.slice(0, MAX_AI_CONTEXT_BYTES)} [truncated]` : json;
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

async function xrplRpc(requestBody: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(process.env["XRPL_FREE_TIER_RPC_URL"] || "https://s1.ripple.com:51234/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(`XRPL account check failed with HTTP ${response.status}.`);
  const payload = await response.json() as { result?: Record<string, any> };
  return payload.result || {};
}

async function isFreeAiEligible(address: string): Promise<boolean> {
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) return false;
  if (process.env["AI_SKIP_XRPL_ACCOUNT_CHECK"] === "1") return true;
  try {
    const accountInfo = await xrplRpc({
      method: "account_info",
      params: [{ account: address, ledger_index: "validated" }],
    });
    const balanceDrops = Number(accountInfo.account_data?.Balance || 0);
    if (!Number.isFinite(balanceDrops) || balanceDrops < MIN_FREE_TIER_BALANCE_DROPS) return false;

    const accountTx = await xrplRpc({
      method: "account_tx",
      params: [{ account: address, ledger_index_min: -1, ledger_index_max: -1, limit: 1 }],
    });
    return Array.isArray(accountTx.transactions) && accountTx.transactions.length > 0;
  } catch {
    return false;
  }
}

async function consumeFreeAiQuota(address: string): Promise<{ ok: true; used: number; remaining: number; limit: number } | { ok: false; limit: number }> {
  const limit = freeDailyLimit();
  const usageDate = todayUtc();
  if (!isD1Configured()) {
    const key = `${address}:${usageDate}`;
    const current = usage.get(key) || 0;
    if (current >= limit) return { ok: false, limit };
    const next = current + 1;
    usage.set(key, next);
    return { ok: true, used: next, remaining: Math.max(0, limit - next), limit };
  }

  const updated = await d1Query<{ count: number }>(
    `INSERT INTO ai_usage (address, usage_date, count, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(address, usage_date) DO UPDATE SET
       count = ai_usage.count + 1,
       updated_at = excluded.updated_at
     WHERE ai_usage.count < ?
     RETURNING count`,
    [address, usageDate, Date.now(), limit],
  );
  const next = Number(updated[0]?.count || 0);
  if (!next || next > limit) return { ok: false, limit };
  return { ok: true, used: next, remaining: Math.max(0, limit - next), limit };
}

async function hasFreeAiQuota(address: string): Promise<{ ok: true; usage: { used: number; remaining: number; limit: number } } | { ok: false; usage: { used: number; remaining: number; limit: number } }> {
  const usage = await readFreeAiUsage(address);
  return usage.remaining > 0 ? { ok: true, usage } : { ok: false, usage };
}

async function readFreeAiUsage(address: string): Promise<{ used: number; remaining: number; limit: number }> {
  const limit = freeDailyLimit();
  const usageDate = todayUtc();
  let used = 0;
  if (isD1Configured()) {
    const existing = await d1Query<{ count: number }>("SELECT count FROM ai_usage WHERE address = ? AND usage_date = ?", [address, usageDate]);
    used = Number(existing[0]?.count || 0);
  } else {
    used = usage.get(`${address}:${usageDate}`) || 0;
  }
  used = Math.max(0, used);
  return { used, remaining: Math.max(0, limit - used), limit };
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

const router = Router();

router.get("/ai/usage", rateLimit({ keyPrefix: "ai-usage", windowMs: 60_000, max: 60 }), requireAuth, async (_req, res) => {
  const user = res.locals["user"] as MarketplaceUser;
  try {
    res.json({ usage: await readFreeAiUsage(user.address) });
  } catch {
    res.status(502).json({ error: "Could not load free AI usage." });
  }
});

router.post("/ai/workflow", rateLimit({ keyPrefix: "ai-workflow", windowMs: 60_000, max: 20 }), requireAuth, async (req, res) => {
  const user = res.locals["user"] as MarketplaceUser;
  const openAiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openAiKey) {
    res.status(501).json({ error: "Free AI is not configured yet." });
    return;
  }
  const bodyBytes = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
  if (bodyBytes > MAX_AI_BODY_BYTES) {
    res.status(413).json({ error: "AI request is too large. Please shorten the prompt or current workflow context." });
    return;
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required." });
    return;
  }
  const messages = sanitizeMessages(req.body?.messages);
  const available = await hasFreeAiQuota(user.address);
  if (!available.ok) {
    res.status(429).json({ error: `Daily free AI limit reached. You get ${available.usage.limit} messages per day.`, usage: available.usage });
    return;
  }
  const eligible = await isFreeAiEligible(user.address);
  if (!eligible) {
    res.status(403).json({ error: "Sorry, your account is flagged by our systems and hence we cannot give you the free 5 AI messages." });
    return;
  }
  const quota = await consumeFreeAiQuota(user.address);
  if (!quota.ok) {
    res.status(429).json({ error: `Daily free AI limit reached. You get ${quota.limit} messages per day.`, usage: { limit: quota.limit, remaining: 0 } });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${openAiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env["OPENAI_FREE_MODEL"] || FREE_AI_DEFAULT_MODEL,
        instructions: buildAiInstructions(req.body?.registryContext, req.body?.currentGraph, prompt, messages),
        input: [...messages.map(message => ({ role: message.role, content: message.text })), { role: "user", content: prompt }],
        max_output_tokens: 3000,
        text: { format: { type: "json_schema", name: "xrpl_workflow", strict: true, schema: AI_RESPONSE_SCHEMA } },
      }),
    });
    const aiPayload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      res.status(502).json({ error: "The free AI assistant could not generate a workflow. Please try again in a moment.", usage: quota });
      return;
    }
    res.json({ ...JSON.parse(extractOpenAiOutputText(aiPayload)), usage: quota });
  } catch {
    res.status(502).json({ error: "The free AI assistant could not generate a workflow. Please try again in a moment.", usage: quota });
  }
});

export default router;
