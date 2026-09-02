# Contributing

## Getting set up

```bash
pnpm install
pnpm dev          # http://localhost:5173, on the bundled fixtures
pnpm test
pnpm e2e
```

## What the layers are for

- `src/domain/**` — pure functions: metrics, the diff model, ranking maths. No
  React, no fetch. ESLint enforces the React part; the rest is on you.
- `src/data/**` — the `RetrievalSource` interface and its implementations. A
  screen must never know whether its data came from a fixture or a server.
- `src/routes/**`, `src/components/**` — the UI.

## Ground rules

- **Metrics are tested against hand-computed values**, never against another
  implementation of the same formula. A metric that agrees with itself proves
  nothing.
- **Fixtures are generated, not written.** `scripts/generate-fixtures.mjs`
  converts real output from `why-this-chunk` and `retrieval-diff`. Hand-edited
  fixtures drift from what the tools actually emit, and then the UI is correct
  about data that does not exist.
- Every behavioural change starts with a failing test.

## Before opening a PR

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
