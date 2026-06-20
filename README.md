# XRPL Flow v2

XRPL Flow is a browser-based, visual builder for constructing and running XRPL transaction workflows. Version 2 uses a typed adapter registry, validates every built transaction with the installed `xrpl` SDK, and treats Mainnet signing as an explicit review operation.

## Run locally

Requirements: Node.js 20+ and pnpm 10+.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Quality checks:

```sh
pnpm typecheck
pnpm build
```

## Transaction support

The palette and configuration UI are generated from the transaction adapter registry in `artifacts/xrpl-flow/src/lib/transactionAdapters.ts`. It covers the standard payment, account, trust line, offer, escrow, check, payment channel, NFT, AMM, credential, oracle, DID, permissioned-domain, MPT, clawback, signer, ticket, deposit authorization, DelegateSet, Vault, Lending, and Batch families exposed by XRPL.js v5.

XChain transactions and `LedgerStateFix` are intentionally excluded. XChain support is deprecated for this product and is not part of registry coverage.

Vault, Lending, and Batch are Devnet-only. A run also checks that the connected Devnet server reports the required amendment. Batch containers require 2–8 non-Batch inner transactions and support all four Batch modes.

## Wallet and Mainnet safety

Generated and imported seeds are held only in the current tab's memory. They are never written to workflow documents or local storage and disappear on refresh. Treat the browser and device as part of your secret-handling boundary; do not import a valuable seed on an untrusted machine.

Transactions can use one local signer, an XRPL signer list with multiple local wallets, Batch account signers, or a Loan counterparty signer. The engine resolves each configured transaction account before execution and refuses to submit if its required local signer is unavailable.

Every Mainnet transaction is individually queued for review after autofill and best-effort simulation. The review shows the network, account, signers, destination, amount, fee, flags, simulation result, warnings, and complete JSON. Signing only happens after confirmation, and the reviewed payload is checked again before it is signed.

## Optional AI workflow builder

The **Ask AI** drawer can generate a workflow from a natural-language prompt using a user-provided OpenAI API key. This is an explicit local BYOK feature: the key is kept in a component reference for the current tab, is never placed in local storage or workflow exports, and can be forgotten immediately from the drawer. Prompts and the current workflow structure are sent directly from the browser to OpenAI.

Browser-side keys can still be observed by malicious extensions, injected scripts, or developer tooling. OpenAI's production guidance is to keep API keys on a backend, so use this local mode only on a trusted self-hosted instance with a restricted project key. For a public deployment, replace BYOK with server-side authentication and secret storage.

Model output is never applied directly. XRPL Flow restricts generated nodes to its adapter registry, rejects XChain and unknown types, parses configuration JSON, validates IDs, edges, triggers, cycles, branch handles, and container relationships, and presents a preview that requires an explicit **Apply to canvas** action.

## Workflow format

Imports and exports use `WorkflowDocumentV2`:

```ts
{
  version: 2;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  nodes: WorkflowNode[];
  edges: Edge[];
}
```

v1 workflows are deliberately not migrated. The app uses a new v2 storage key, clears the legacy key, and reports an incompatibility error for v1 imports. Imports are checked for size, known node types, exactly one trigger, duplicate or invalid edges, unreachable nodes, and ordinary graph cycles.

Branching requires a Condition Branch or Parallel Split. Sync Join waits for the branches created by its associated split. Repetition uses a Loop Container; its child nodes execute afresh on each iteration and its outer successor runs once.

Condition and loop expressions use an allowlisted `jsep` grammar. They may read `output` properties and use literals, parentheses, comparison/equality, boolean operators, and unary `!`. Function calls, assignments, computed properties, constructors, and global access are rejected.

## Current verification scope

This phase intentionally does not introduce a test runner or live-network CI. Acceptance is based on clean locked installation, workspace typecheck/build, SDK validation in every transaction adapter, and manual Testnet/Devnet/Mainnet-dry-run and accessibility passes.
