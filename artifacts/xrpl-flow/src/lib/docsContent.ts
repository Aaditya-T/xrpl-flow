export type DocsBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'code'; language?: string; code: string }
  | { type: 'callout'; title: string; text: string }
  | { type: 'workflow-examples'; title?: string; examples: string[] };

export interface DocsSection {
  id: string;
  title: string;
  blocks: DocsBlock[];
}

export interface DocsPage {
  id: string;
  title: string;
  summary: string;
  sections: DocsSection[];
}

export const DOCS_PAGES: DocsPage[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary: 'Build your first XRPL workflow, load real examples, and learn the main surfaces without reading the whole manual first.',
    sections: [
      {
        id: 'quick-start',
        title: 'A Five Minute First Run',
        blocks: [
          { type: 'p', text: 'Start on Testnet. Load a simple read-only query first, connect to XRPL, and run it before touching transactions. Once that feels normal, graduate to payments, loops, exports, and guarded automations.' },
          { type: 'ul', items: ['Open Token Holder Snapshot for a safe query-first example.', 'Fill the Account field with a testnet account address.', 'Connect to Testnet in the header.', 'Press Run and inspect the execution log.', 'Copy the pattern into your own workflow when the shape makes sense.'] },
          { type: 'workflow-examples', title: 'Start here', examples: ['Token Holder Snapshot', 'Send XRP', 'Account Audit CSV'] },
        ],
      },
      {
        id: 'canvas-basics',
        title: 'Canvas Basics',
        blocks: [
          { type: 'p', text: 'XRPL Flow is a visual workflow builder. Drag nodes from the palette onto the canvas, connect handles between nodes, configure each node, then run the graph.' },
          { type: 'ul', items: ['Use the left palette to add triggers, queries, transactions, data utilities, and control flow nodes.', 'Click a node to open its configuration on the right.', 'Connect nodes from left to right to define execution order.', 'Save, duplicate, import, and export workflows from the header.'] },
        ],
      },
      {
        id: 'config-panel',
        title: 'Config Panel',
        blocks: [
          { type: 'p', text: 'The config panel shows required fields first and optional fields under Advanced. Changes save into the workflow automatically.' },
          { type: 'p', text: 'Fields with an info icon have deeper documentation. Click the icon to open the exact docs section for that field.' },
        ],
      },
      {
        id: 'workflow-files',
        title: 'Import And Export',
        blocks: [
          { type: 'p', text: 'Export creates a portable JSON workflow document. Import validates version, node types, required fields, and graph safety before loading it.' },
          { type: 'callout', title: 'Beta note', text: 'Keep exported copies of important workflows while the platform is in beta.' },
        ],
      },
      {
        id: 'common-use-cases',
        title: 'Common Use Cases',
        blocks: [
          { type: 'p', text: 'Most useful workflows are small combinations of a few patterns: query, delay, loop, branch, export, and transaction review. These examples are lightweight enough to inspect, but real enough to adapt.' },
          { type: 'workflow-examples', title: 'Useful shapes to copy', examples: ['Loop 3×', 'Delay Between Txns', 'Guarded Treasury Payout', 'Fetch All Holders by Issuer CSV', 'Airdrop Prep: Query Eligible Wallets', 'DEX Offer Placement Test'] },
        ],
      },
    ],
  },
  {
    id: 'running-workflows',
    title: 'Running Workflows',
    summary: 'Connect to XRPL networks, review transactions, run graphs, and stop active executions.',
    sections: [
      {
        id: 'networks',
        title: 'Networks',
        blocks: [
          { type: 'p', text: 'Use Testnet or Devnet while designing workflows. Mainnet transactions change real ledger state and should be reviewed carefully.' },
          { type: 'ul', items: ['The main network selector chooses Mainnet, Testnet, Devnet, or Custom.', 'Advanced routing lets power users choose rippled and Clio endpoints.', 'Historical queries may prefer Clio/full-history endpoints when available.'] },
        ],
      },
      {
        id: 'transaction-review',
        title: 'Transaction Review',
        blocks: [
          { type: 'p', text: 'Transaction nodes prepare payloads and show a review dialog before signing. Verify destination, amount, flags, and fees before continuing.' },
        ],
      },
      {
        id: 'stopping',
        title: 'Stopping A Run',
        blocks: [
          { type: 'p', text: 'The Stop button aborts the active run. If a transaction has already been submitted to XRPL, stopping cannot reverse ledger state.' },
          { type: 'workflow-examples', title: 'Try delay behavior safely', examples: ['Delay Between Txns', 'Escrow Create & Finish'] },
        ],
      },
    ],
  },
  {
    id: 'wallets-signing',
    title: 'Wallets & Signing',
    summary: 'Use local wallets, Xaman sign-in, single signing, and multisign workflows.',
    sections: [
      {
        id: 'local-wallets',
        title: 'Local Wallets',
        blocks: [
          { type: 'p', text: 'The active local wallet is used for transaction signing unless a transaction node selects another account or signing mode.' },
          { type: 'callout', title: 'Mainnet caution', text: 'Use funded Mainnet wallets only when you are ready to submit real transactions.' },
        ],
      },
      {
        id: 'xaman',
        title: 'Xaman Sign-In',
        blocks: [
          { type: 'p', text: 'Xaman sign-in identifies your account for beta features such as hosted AI quota. It is separate from local seed-based transaction signing.' },
        ],
      },
      {
        id: 'multisign',
        title: 'Multisign',
        blocks: [
          { type: 'p', text: 'Choose XRPL multisign on a transaction node and select imported signer wallets whose ledger signer weights meet quorum.' },
        ],
      },
    ],
  },
  {
    id: 'nodes-overview',
    title: 'Nodes Overview',
    summary: 'Understand the major node families and when to use them.',
    sections: [
      {
        id: 'node-families',
        title: 'Node Families',
        blocks: [
          { type: 'ul', items: ['Triggers start a workflow manually or from an account event.', 'Ledger queries read account, ledger, transaction, NFT, and trust line data.', 'Transaction nodes build and submit XRPL transactions after review.', 'Data utilities reshape, filter, dedupe, accumulate, and export previous outputs.', 'Control flow nodes branch, join, delay, and repeat execution.', 'Output nodes log useful data at the end of a run.'] },
        ],
      },
      {
        id: 'data-flow',
        title: 'Data Flow',
        blocks: [
          { type: 'p', text: 'Each node receives the previous node output as `output`. Data utility nodes can turn ledger responses into simpler objects for later conditions or exports.' },
        ],
      },
    ],
  },
  {
    id: 'safe-expressions',
    title: 'Safe Expressions',
    summary: 'Write small allowlisted boolean expressions for branches and loop stop conditions.',
    sections: [
      {
        id: 'syntax',
        title: 'Syntax',
        blocks: [
          { type: 'p', text: 'Safe expressions evaluate against the previous node output. They are intentionally small so workflows can make decisions without running arbitrary JavaScript.' },
          {
            type: 'code',
            language: 'ts',
            code: 'output.count >= 3\noutput.meta.TransactionResult == "tesSUCCESS"\n!output.data.marker\noutput.balance >= 5000000 && output.ok == true',
          },
          { type: 'workflow-examples', title: 'See expressions inside workflows', examples: ['Conditional Branch', 'Guarded Treasury Payout', 'Fetch All Holders by Issuer CSV'] },
        ],
      },
      {
        id: 'security-bounds',
        title: 'Security Bounds',
        blocks: [
          { type: 'ul', items: ['Only `output` is allowed as the root identifier.', 'Allowed operators: `==`, `!=`, `===`, `!==`, `>`, `>=`, `<`, `<=`, `&&`, `||`, `!`.', 'Dot access is allowed, such as `output.data.marker`.', 'Function calls, bracket access, arithmetic, globals, and prototype-sensitive fields are rejected.', 'Empty expressions fail validation.'] },
        ],
      },
      {
        id: 'loop-stop-conditions',
        title: 'Loop Stop Conditions',
        blocks: [
          { type: 'p', text: 'In an until-condition loop, the stop condition is evaluated after each loop iteration. When it returns true, the Loop Container exits and continues to the next outer node.' },
          { type: 'code', language: 'ts', code: 'output.count >= 3\n!output.data.marker\noutput.meta.TransactionResult != "tesSUCCESS"' },
          { type: 'callout', title: 'Pagination pattern', text: 'For paginated XRPL responses, `!output.data.marker` means there is no next page, so the loop can stop.' },
        ],
      },
    ],
  },
  {
    id: 'loop-containers',
    title: 'Loop Containers',
    summary: 'Repeat contained nodes safely with bounded counts, stop conditions, and delays.',
    sections: [
      {
        id: 'modes',
        title: 'Loop Modes',
        blocks: [
          { type: 'p', text: '`count` repeats a fixed number of times. `until-condition` repeats until the safe expression returns true or the max iteration limit is reached.' },
          { type: 'ul', items: ['Iterations must be between 1 and 100.', 'Contained child nodes execute by position order from left to right and top to bottom.', 'The Loop Container continues downstream once after the loop finishes.'] },
          { type: 'workflow-examples', title: 'Loop examples', examples: ['Loop 3×', 'Fetch All Holders by Issuer CSV'] },
        ],
      },
      {
        id: 'repeat-every-n-minutes',
        title: 'Repeat Every N Minutes',
        blocks: [
          { type: 'p', text: 'Use `DelayBetween` on the Loop Container for repeated checks. The value is milliseconds, so five minutes is 300000.' },
          { type: 'code', language: 'ts', code: 'DelayBetween = 300000' },
          { type: 'p', text: 'For a check every five minutes, put the query/check nodes inside the Loop Container, set a bounded iteration count, and set `DelayBetween` to `300000`.' },
          { type: 'workflow-examples', title: 'Delay and repeat patterns', examples: ['Loop 3×', 'Delay Between Txns', 'Loan State Management Test Case'] },
        ],
      },
      {
        id: 'container-edges',
        title: 'Container Edges',
        blocks: [
          { type: 'p', text: 'Graph edges may connect into or out of the Loop Container itself. Child nodes inside the loop must not have outer graph edges.' },
          { type: 'callout', title: 'Unsafe graph error', text: 'If you see “Container child nodes cannot have outer graph edges,” remove edges attached directly to nodes inside the container. Connect the outer graph to the Loop Container instead.' },
        ],
      },
    ],
  },
  {
    id: 'branching-parallel',
    title: 'Branching & Parallel Flow',
    summary: 'Route through true/false paths and rejoin parallel branches.',
    sections: [
      {
        id: 'condition-branch',
        title: 'Condition Branch',
        blocks: [
          { type: 'p', text: 'Condition Branch evaluates a safe expression and routes execution through the true or false handle.' },
          { type: 'code', language: 'ts', code: 'output.meta.TransactionResult == "tesSUCCESS"' },
          { type: 'workflow-examples', title: 'Branching examples', examples: ['Conditional Branch', 'Guarded Treasury Payout'] },
        ],
      },
      {
        id: 'parallel-split',
        title: 'Parallel Split And Sync Join',
        blocks: [
          { type: 'p', text: 'Parallel Split fans out to multiple branches. Sync Join waits for inbound branches before continuing.' },
          { type: 'workflow-examples', title: 'Parallel examples', examples: ['Parallel Branches', 'Account Audit CSV', 'Loan Payment Modes Test Matrix'] },
        ],
      },
    ],
  },
  {
    id: 'pagination-patterns',
    title: 'Pagination Patterns',
    summary: 'Loop through XRPL marker-based responses and collect every page.',
    sections: [
      {
        id: 'markers',
        title: 'Markers And Marker Endpoints',
        blocks: [
          { type: 'p', text: 'XRPL paginated responses return a `marker` when more results are available. Some responses also need the same endpoint for the next request, so XRPL Flow preserves `markerEndpoint`.' },
          { type: 'code', language: 'ts', code: 'Marker = {{output.data.marker}}\nMarkerEndpoint = {{output.data.markerEndpoint}}' },
        ],
      },
      {
        id: 'accumulate-items',
        title: 'Accumulate Items',
        blocks: [
          { type: 'p', text: 'Place the paginated query and Accumulate Items inside a Loop Container. Use a stop condition such as `!output.data.marker` to exit after the final page.' },
          { type: 'workflow-examples', title: 'Pagination workflows', examples: ['Fetch Trustlines CSV', 'Fetch All Holders by Issuer CSV'] },
        ],
      },
      {
        id: 'holder-export',
        title: 'Holder Export',
        blocks: [
          { type: 'p', text: 'A common holder export flow is AccountLinesQuery, AccumulateItems, FormatTrustLines, then ExportCsv. Keep the query and accumulator inside the loop.' },
          { type: 'workflow-examples', title: 'Holder and export examples', examples: ['Token Holder Snapshot', 'Fetch All Holders by Issuer CSV', 'Airdrop Prep: Query Eligible Wallets'] },
        ],
      },
    ],
  },
  {
    id: 'xrpl-query-nodes',
    title: 'XRPL Query Nodes',
    summary: 'Read ledger data with rippled and Clio-aware routing.',
    sections: [
      {
        id: 'ledger-index',
        title: 'Ledger Index',
        blocks: [
          { type: 'p', text: 'Use `validated` for stable ledger data unless you intentionally need current or closed ledger state.' },
          { type: 'workflow-examples', title: 'Read-only query examples', examples: ['Token Holder Snapshot', 'NFT Issuer Analytics (Clio)', 'Account Audit CSV'] },
        ],
      },
      {
        id: 'clio',
        title: 'Clio Queries',
        blocks: [
          { type: 'p', text: 'History-heavy queries and some NFT methods are Clio-only or Clio-preferred. Configure a Clio endpoint under Advanced network routing for heavier workloads.' },
        ],
      },
    ],
  },
  {
    id: 'transaction-fields',
    title: 'Transaction Fields',
    summary: 'Configure drops, issued tokens, MPTs, JSON fields, flags, and common XRPL fields.',
    sections: [
      {
        id: 'amounts',
        title: 'Amounts',
        blocks: [
          { type: 'p', text: 'XRP amounts are entered in drops. One XRP equals 1,000,000 drops. Issued token amounts use currency, issuer, and value. MPT amounts use issuance ID and value.' },
          { type: 'workflow-examples', title: 'Transaction examples', examples: ['Send XRP', 'Issue Token (2 Wallets)', 'Create AMM Pool', 'Check Payment Lifecycle'] },
        ],
      },
      {
        id: 'json-fields',
        title: 'JSON Fields',
        blocks: [
          { type: 'p', text: 'Structured fields such as Memos, SignerEntries, NFTokenOffers, and RequestJson must be valid JSON. Use the Format button to normalize valid input.' },
          { type: 'code', language: 'json', code: '[{"Memo":{"MemoType":"68656c6c6f","MemoData":"776f726c64"}}]' },
        ],
      },
      {
        id: 'common-fields',
        title: 'Common Transaction Fields',
        blocks: [
          { type: 'p', text: 'Fee and Sequence can usually be left blank. Advanced users can fill LastLedgerSequence, SourceTag, TicketSequence, AccountTxnID, NetworkID, Memos, and Flags when needed.' },
        ],
      },
    ],
  },
  {
    id: 'ai-assistant',
    title: 'AI Assistant',
    summary: 'Generate workflow drafts with hosted beta AI or a direct custom provider.',
    sections: [
      {
        id: 'free-tier',
        title: 'Free Beta AI',
        blocks: [
          { type: 'p', text: 'Signed-in eligible Xaman accounts can use the hosted beta AI quota. The app shows remaining daily messages in the AI panel.' },
        ],
      },
      {
        id: 'custom-provider',
        title: 'Custom Provider',
        blocks: [
          { type: 'p', text: 'Power users can configure endpoint, model, and API key in the browser. Custom AI requests go directly from the frontend to the configured provider.' },
        ],
      },
      {
        id: 'ai-validation',
        title: 'AI Validation',
        blocks: [
          { type: 'p', text: 'AI-generated workflows are validated before they are applied. If the AI proposes an unsafe graph, XRPL Flow blocks it and shows the error.' },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    summary: 'Decode common graph, network, auth, and AI generation errors.',
    sections: [
      {
        id: 'unsafe-graphs',
        title: 'Unsafe Graph Errors',
        blocks: [
          { type: 'p', text: 'Unsafe graph errors mean the workflow did not pass validation and will not run until fixed. This protects users from ambiguous execution, invalid container wiring, and unsupported node behavior.' },
          { type: 'ul', items: ['Use exactly one trigger.', 'Do not connect edges into trigger nodes.', 'Do not connect outer graph edges directly to container child nodes.', 'Use true/false handles for Condition Branch edges.', 'Keep loop iterations bounded from 1 to 100.'] },
          { type: 'callout', title: 'Report AI generation issues', text: 'If AI generated the unsafe graph, take a screenshot of the error and report it to the devs.' },
          { type: 'workflow-examples', title: 'Known-safe graph shapes', examples: ['Loop 3×', 'Conditional Branch', 'Fetch All Holders by Issuer CSV'] },
        ],
      },
      {
        id: 'network-failures',
        title: 'Network Failures',
        blocks: [
          { type: 'p', text: 'Network errors can come from public endpoint rate limits, unavailable Clio history, local proxy settings, or provider downtime. Try another endpoint under Advanced routing.' },
        ],
      },
      {
        id: 'xaman-sign-in',
        title: 'Xaman Sign-In',
        blocks: [
          { type: 'p', text: 'If Xaman sign-in fails locally, confirm the API server is running with network access and the Xaman OAuth environment variables are configured.' },
        ],
      },
    ],
  },
];

export const DEFAULT_DOCS_PAGE_ID = DOCS_PAGES[0].id;

export function findDocsPage(pageId: string | null | undefined): DocsPage {
  return DOCS_PAGES.find(page => page.id === pageId) || DOCS_PAGES[0];
}

export function findDocsSection(page: DocsPage, sectionId: string | null | undefined): DocsSection | undefined {
  return page.sections.find(section => section.id === sectionId);
}

export function parseDocsId(docsId: string): { pageId: string; sectionId?: string } {
  const [pageId, sectionId] = docsId.split('#');
  return { pageId: pageId || DEFAULT_DOCS_PAGE_ID, sectionId };
}
