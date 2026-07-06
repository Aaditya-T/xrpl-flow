type XrplKnowledgeSnippet = {
  id: string;
  title: string;
  keywords: string[];
  sourceUrl: string;
  body: string;
};

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

function scoreSnippet(snippet: XrplKnowledgeSnippet, text: string): number {
  let score = 0;
  for (const keyword of snippet.keywords) {
    const normalized = keyword.toLowerCase();
    if (!normalized) continue;
    if (text.includes(normalized)) score += normalized.includes(" ") ? 5 : 2;
  }
  if (text.includes(snippet.id.replace(/-/g, " "))) score += 4;
  return score;
}

export function formatXrplKnowledge(context: unknown, limit = 5): string {
  const text = JSON.stringify(context ?? "").toLowerCase();
  const snippets = XRPL_KNOWLEDGE_SNIPPETS
    .map(snippet => ({ snippet, score: scoreSnippet(snippet, text) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.snippet.title.localeCompare(b.snippet.title))
    .slice(0, limit)
    .map(item => item.snippet);
  if (snippets.length === 0) return "No specific XRPL docs context matched. Use the node registry and ask the user to fill missing XRPL details.";
  return snippets.map(snippet => `- ${snippet.title}: ${snippet.body} Source: ${snippet.sourceUrl}`).join("\n");
}
