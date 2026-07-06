import crypto from "node:crypto";
import { Router } from "express";
import { requireAuth, type MarketplaceUser } from "../lib/auth";
import { d1Query, isD1Configured } from "../lib/d1";
import { rateLimit } from "../lib/rateLimit";

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

const templates = new Map<string, MarketplaceTemplate>();
const MAX_WORKFLOW_NODES = 500;
const MAX_WORKFLOW_EDGES = 1000;
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
  if ((record["nodes"] as unknown[]).length === 0) {
    return { ok: false, error: "Workflow must contain at least one node before publishing." };
  }
  const nodes = record["nodes"] as unknown[];
  const edges = record["edges"] as unknown[];
  if (nodes.length > MAX_WORKFLOW_NODES || edges.length > MAX_WORKFLOW_EDGES) {
    return { ok: false, error: `Workflow is too large to publish. Limit ${MAX_WORKFLOW_NODES} nodes and ${MAX_WORKFLOW_EDGES} edges.` };
  }
  const size = Buffer.byteLength(JSON.stringify(value), "utf8");
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

async function listTemplates(): Promise<MarketplaceTemplate[]> {
  if (!isD1Configured()) return [...templates.values()];
  const rows = await d1Query<D1TemplateRow>(
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
  );
  return rows.map(rowToTemplate);
}

async function createTemplate(template: MarketplaceTemplate): Promise<void> {
  if (!isD1Configured()) {
    templates.set(template.id, template);
    return;
  }
  await d1Query(
    `INSERT INTO marketplace_users (address, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
    [template.authorAddress, template.authorName, template.createdAt, template.updatedAt],
  );
  await d1Query(
    `INSERT INTO marketplace_templates (
      id, name, description, tags_json, author_address, workflow_json, created_at, updated_at, published
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      template.id,
      template.name,
      template.description,
      JSON.stringify(template.tags),
      template.authorAddress,
      JSON.stringify(template.workflow),
      template.createdAt,
      template.updatedAt,
    ],
  );
}

async function deleteTemplate(id: string, authorAddress: string): Promise<boolean> {
  if (!isD1Configured()) {
    const existing = templates.get(id);
    if (!existing || existing.authorAddress !== authorAddress) return false;
    templates.delete(id);
    return true;
  }
  const existing = await d1Query<{ id: string }>(
    `SELECT id FROM marketplace_templates WHERE id = ? AND author_address = ? AND published = 1 LIMIT 1`,
    [id, authorAddress],
  );
  if (existing.length === 0) return false;
  await d1Query(
    `UPDATE marketplace_templates
     SET published = 0, updated_at = ?
     WHERE id = ? AND author_address = ? AND published = 1`,
    [Date.now(), id, authorAddress],
  );
  return true;
}

const router = Router();

router.get("/marketplace/templates", rateLimit({ keyPrefix: "market-list", windowMs: 60_000, max: 120 }), async (req, res) => {
  const q = String(req.query["q"] || "").toLowerCase().trim();
  const tag = String(req.query["tag"] || "").trim();
  try {
    const items = (await listTemplates())
      .filter(item => ![item.name, ...item.tags].some(value => /batch/i.test(value)))
      .filter(item => !tag || item.tags.includes(tag))
      .filter(item => !q || [item.name, item.description, item.authorName, ...item.tags].join(" ").toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
    res.json({ templates: items });
  } catch {
    res.status(502).json({ error: "Could not load marketplace templates." });
  }
});

router.post(
  "/marketplace/templates",
  rateLimit({ keyPrefix: "market-publish", windowMs: 60_000, max: 10 }),
  requireAuth,
  async (req, res) => {
    const user = res.locals["user"] as MarketplaceUser;
    const workflowValidation = validateWorkflowDocument(req.body?.workflow);
    if (!workflowValidation.ok) {
      res.status(400).json({ error: workflowValidation.error });
      return;
    }
    const name = String(req.body?.name || (workflowValidation.workflow as Record<string, unknown>)["name"] || "").trim().slice(0, 100);
    const description = String(req.body?.description || "").trim().slice(0, 500);
    const authorName = String(req.body?.authorName || user.displayName || user.address).trim().slice(0, 80);
    const tags = cleanTags(req.body?.tags);
    if (!name) {
      res.status(400).json({ error: "Template name is required." });
      return;
    }
    if (!description) {
      res.status(400).json({ error: "Template description is required." });
      return;
    }
    if ([name, ...tags].some(value => /batch/i.test(value))) {
      res.status(400).json({ error: "Batch templates are disabled until Batch is live." });
      return;
    }
    if (tags.length === 0) {
      res.status(400).json({ error: "Add at least one marketplace tag." });
      return;
    }
    const now = Date.now();
    const id = crypto.randomUUID();
    const template: MarketplaceTemplate = {
      id,
      name,
      description,
      tags,
      authorAddress: user.address,
      authorName: authorName || user.address,
      workflow: workflowValidation.workflow,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await createTemplate(template);
      res.status(201).json({ template });
    } catch {
      res.status(502).json({ error: "Could not publish marketplace template." });
    }
  },
);

router.delete(
  "/marketplace/templates/:id",
  rateLimit({ keyPrefix: "market-delete", windowMs: 60_000, max: 30 }),
  requireAuth,
  async (req, res) => {
    const user = res.locals["user"] as MarketplaceUser;
    const id = String(req.params["id"] || "").trim();
    if (!id) {
      res.status(400).json({ error: "Template id is required." });
      return;
    }
    try {
      const deleted = await deleteTemplate(id, user.address);
      if (!deleted) {
        res.status(404).json({ error: "Template not found for this account." });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(502).json({ error: "Could not delete marketplace template." });
    }
  },
);

export default router;
