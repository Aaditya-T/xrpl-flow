import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const equalsAt = normalized.indexOf("=");
  if (equalsAt <= 0) return null;
  const key = normalized.slice(0, equalsAt).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  let value = normalized.slice(equalsAt + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

for (const filePath of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(apiRoot, ".env"),
  path.join(apiRoot, ".env.local"),
]) {
  loadEnvFile(filePath);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !databaseId || !apiToken) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, or CLOUDFLARE_API_TOKEN.");
  process.exit(1);
}

const TEMPLATE_DETAILS = {
  "Send XRP": { description: "A minimal payment flow with a manual trigger and result logging.", tags: ["Beginner", "Payments"] },
  "Issue Token (2 Wallets)": { description: "Configure an issuer, establish a trust line, and distribute an issued token.", tags: ["Tokens", "Multi-wallet"] },
  "Parallel Branches": { description: "Run two transaction branches concurrently and synchronize their results.", tags: ["Parallel", "Control flow"] },
  "Loop 3×": { description: "Repeat a contained transaction safely with a bounded loop.", tags: ["Loop", "Control flow"] },
  "Delay Between Txns": { description: "Sequence transactions with an abort-aware delay between them.", tags: ["Timing", "Payments"] },
  "Conditional Branch": { description: "Route execution through true and false paths using a safe expression.", tags: ["Conditions", "Control flow"] },
  "Mint & List NFT": { description: "Mint an NFT and create a sell offer in one guided workflow.", tags: ["NFT", "Marketplace"] },
  "Create AMM Pool": { description: "Create and seed an automated market maker pool.", tags: ["AMM", "DEX"] },
  "Escrow Create & Finish": { description: "Create an XRP escrow, wait, and finish it.", tags: ["Escrow", "Payments"] },
  "Token Holder Snapshot": { description: "Query trust lines, filter active holders, and log a reusable holder snapshot.", tags: ["Queries", "Tokens", "Growth"] },
  "Airdrop Prep: Query Eligible Wallets": { description: "Use transaction history to build a deduped candidate list before a campaign airdrop.", tags: ["Airdrop", "Clio", "Community"] },
  "NFT Issuer Analytics (Clio)": { description: "Use a Clio-only method to inspect NFTs minted by an issuer.", tags: ["NFT", "Clio", "Analytics"] },
  "Guarded Treasury Payout": { description: "Check treasury balance first, then branch into a payout or a safe stop.", tags: ["Treasury", "Safety", "Payments"] },
  "Fetch Trustlines CSV": { description: "Fetch the first 200 trust lines for an account and export friendly CSV columns.", tags: ["CSV", "Trustlines", "Export"] },
  "Fetch All Holders by Issuer CSV": { description: "Loop through account_lines markers, accumulate every page, format holders, and export CSV.", tags: ["Pagination", "Holders", "CSV"] },
  "Vault Lifecycle Test Case (Devnet)": { description: "Create a single-asset vault, then test deposit, withdraw, and delete steps with explicit VaultID handoff.", tags: ["Test Cases", "Devnet", "Vaults", "Lifecycle"] },
  "Private Vault Configuration Test": { description: "Exercise private/non-transferable vault setup and VaultSet metadata/config updates.", tags: ["Test Cases", "Devnet", "Vaults", "Permissions"] },
  "Vault Clawback Test Case": { description: "Template for issuer clawback validation against a vault holder.", tags: ["Test Cases", "Devnet", "Vaults", "Compliance"] },
  "Loan Broker Setup Test Case": { description: "Create vault collateral rails, configure a loan broker, and deposit first-loss cover.", tags: ["Test Cases", "Devnet", "Lending", "Borrow"] },
  "Loan Origination Test Case": { description: "Create a loan agreement with borrower counterparty fields and common fee/rate knobs.", tags: ["Test Cases", "Devnet", "Lending", "Borrow"] },
  "Loan Payment Modes Test Matrix": { description: "Run separate payment-mode branches for normal, late, overpayment, and full early payment cases.", tags: ["Test Cases", "Devnet", "Lending", "Repayment"] },
  "Loan State Management Test Case": { description: "Exercise impair, unimpaired, default, and delete management steps for a loan.", tags: ["Test Cases", "Devnet", "Lending", "Failure Modes"] },
  "Cover Withdraw & Clawback Test": { description: "Validate broker cover withdrawal and cover clawback operations.", tags: ["Test Cases", "Devnet", "Lending", "Compliance"] },
  "Check Payment Lifecycle": { description: "Create, cash, and optionally cancel checks for deferred-payment testing.", tags: ["Payments", "Checks", "Test Cases"] },
  "NFT Offer Lifecycle Test": { description: "Mint, list, accept/cancel, and burn NFT flows for marketplace testing.", tags: ["NFT", "Marketplace", "Test Cases"] },
  "Account Audit CSV": { description: "Query account objects and transaction history, then export audit-friendly CSV snapshots.", tags: ["Queries", "CSV", "Audit"] },
  "DEX Offer Placement Test": { description: "Create an offer, wait for a ledger close, then log/query the result for DEX smoke tests.", tags: ["DEX", "Offers", "Test Cases"] },
};

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    const detail = json.errors?.map(error => error.message).filter(Boolean).join("; ") || response.statusText;
    throw new Error(detail);
  }
  return json;
}

const tempDir = mkdtempSync(path.join(tmpdir(), "xrpl-flow-seed-"));
const bundledPath = path.join(tempDir, "exampleWorkflows.mjs");

try {
  await build({
    entryPoints: [path.join(repoRoot, "artifacts", "xrpl-flow", "src", "lib", "exampleWorkflows.ts")],
    outfile: bundledPath,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });

  const { EXAMPLE_WORKFLOWS } = await import(pathToFileURL(bundledPath).href);
  const authorAddress = "xrpl-flow-official";
  const authorName = "XRPL Flow";
  const now = Date.now();

  await query(
    `INSERT INTO marketplace_users (address, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
    [authorAddress, authorName, now, now],
  );

  let seeded = 0;
  for (const workflow of EXAMPLE_WORKFLOWS) {
    if (/batch/i.test(workflow.name)) continue;
    const metadata = TEMPLATE_DETAILS[workflow.name] || { description: "Official XRPL Flow workflow template.", tags: ["Template"] };
    const document = {
      version: 2,
      id: `official-${slug(workflow.name)}`,
      name: workflow.name,
      createdAt: now,
      updatedAt: now,
      nodes: workflow.nodes,
      edges: workflow.edges,
    };
    await query(
      `INSERT INTO marketplace_templates (
        id, name, description, tags_json, author_address, workflow_json, created_at, updated_at, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        tags_json = excluded.tags_json,
        author_address = excluded.author_address,
        workflow_json = excluded.workflow_json,
        updated_at = excluded.updated_at,
        published = 1`,
      [
        document.id,
        document.name,
        metadata.description,
        JSON.stringify(metadata.tags),
        authorAddress,
        JSON.stringify(document),
        now,
        now,
      ],
    );
    seeded += 1;
  }

  console.log(`Seeded ${seeded} official marketplace templates into Cloudflare D1.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
