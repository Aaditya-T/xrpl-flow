# Testing XRPL Flow

XRPL Flow treats tests as part of the public contract for contributors. The default suite is offline, deterministic, and safe to run without funded wallets or real secrets.

## Commands

```sh
pnpm test              # Offline Vitest suite
pnpm test:unit         # Transaction, workflow, query, binding, and store-adjacent tests
pnpm test:api          # Express API and rate-limit tests
pnpm test:e2e          # Playwright browser tests with mocked API responses
pnpm test:coverage     # Offline coverage report
pnpm test:ci           # Typecheck, build, offline tests, mocked browser tests
pnpm test:smoke:xrpl   # Opt-in live testnet/devnet smoke test
```

Install Playwright browsers once when running E2E tests locally:

```sh
pnpm exec playwright install chromium
```

## Test Layers

- Transaction adapter tests walk the registry and build one minimal valid transaction for every transaction node. They also lock required-field behavior, raw/named flag conflicts, incompatible flag groups, fallback accounts, and inner Batch shaping.
- Workflow tests cover graph legality, walletless query/data flows, transaction seed requirements, devnet-only gating, loop bounds, abort handling, and delay behavior.
- API tests use the Express app in memory and reset rate-limit buckets after each test. They cover auth state, marketplace publish/list validation, batch-template rejection, Xaman failure paths, and `429` headers.
- Playwright tests run against a production Vite preview with mocked `/api` responses. They check app boot, palette search, import validation, marketplace browse, and mocked publish wiring.

## Fixture Policy

- Never commit real seeds, private keys, funded-wallet secrets, or production API keys.
- Unit tests may generate ephemeral wallets in memory.
- Use registry-driven fixture builders in `tests/helpers` so adding a node creates obvious test failures until defaults and validation are handled.
- Test workflows should use `WorkflowDocumentV2`; v1 documents are intentionally invalid.

## Live XRPL Smoke Tests

Live tests are intentionally excluded from PR CI because public XRPL endpoints can rate-limit, test wallets can run out of funds, and ledger timing can be noisy.

Run them manually before beta deploy:

```sh
XRPL_SMOKE_NETWORK=testnet \
XRPL_SMOKE_SEED=s... \
XRPL_SMOKE_DESTINATION=r... \
XRPL_SMOKE_DROPS=1 \
pnpm test:smoke:xrpl
```

Supported networks are `testnet` and `devnet`. Mainnet is blocked. Use disposable funded wallets only.

Optional override:

```sh
XRPL_SMOKE_URL=wss://your-testnet-node.example.com
```

## Rate Limits

The API rate limiter sets `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. Tests call the exported `resetRateLimitBuckets()` hook after each case so limits are deterministic. Do not use that hook in runtime code.

## Debugging

- Re-run a single Vitest file with `pnpm exec vitest run tests/unit/transactionAdapters.test.ts`.
- Open Playwright's UI with `pnpm exec playwright test --ui`.
- Inspect Playwright artifacts in `playwright-report/` and `test-results/` after failures.
- Coverage output is written to `coverage/`.
