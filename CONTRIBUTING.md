# Contributing

Thanks for helping make XRPL Flow safer. This project touches real ledger workflows, so tests and secret hygiene matter.

## Development

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:e2e
```

Run `pnpm test:ci` before opening a pull request when the change touches workflow execution, transaction construction, API behavior, or browser flows.

## Test Expectations

- New transaction nodes need adapter tests with a valid minimal config and invalid required-field coverage.
- New named flags need conflict tests when they are mutually exclusive.
- Workflow engine changes need graph/runtime tests.
- Query and data utility changes need walletless tests.
- API route changes need Supertest coverage, including auth and rate-limit behavior when relevant.
- Browser workflow changes need Playwright coverage when the behavior is user-visible.
- Bug fixes should include a regression test unless the issue is purely documentation or styling.

## Secrets

Do not commit real seeds, private keys, funded-wallet credentials, production API keys, or marketplace tokens. Live XRPL smoke tests must use local environment variables and disposable testnet/devnet wallets.

## Pull Requests

Keep changes focused. Include the commands you ran and call out any skipped tests with the reason. If a change affects transaction safety, explain how it fails closed.
