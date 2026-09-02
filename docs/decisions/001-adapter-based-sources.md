# ADR 001 — Retrieval sources are adapter-based

**Status:** accepted · **Date:** 2026-09-02

## Context

This UI explains the output of two Python tools — `why-this-chunk` and
`retrieval-diff`. The obvious design is to call them: run a FastAPI process,
have the frontend fetch from it, done.

That design has three problems, and they are the ones that decide whether
anybody ever looks at the thing:

1. **The demo needs a backend.** A portfolio link that says "clone this, create
   a virtualenv, install two Python packages, start a server, then reload" is a
   link nobody follows.
2. **The tests need a backend.** A test suite that needs a Python process is a
   test suite that runs on one machine, slowly, and eventually not at all.
3. **A team with their own retriever has to fork.** Their index is not our
   index and their scores are not our scores.

## Decision

One interface. Everything above it is written against that and nothing else:

```ts
interface RetrievalSource {
  readonly name: string;
  listRuns(): Promise<RunSummary[]>;
  getRun(id: string): Promise<RetrievalRun>;
  getExplanation(runId, query, chunkId): Promise<Explanation | null>;
}
```

Two implementations ship. `fixtureSource` reads recorded runs and is the
default: it powers the demo, the tests and local development, offline.
`httpSource` speaks to a live backend over three endpoints, with the same
methods and the same types.

Two consequences of that shape are worth naming:

- **The domain model mirrors the Python tools field for field.** If the
  frontend invented its own vocabulary, `httpSource` would become a
  translation, and translations drift from the thing they translate.
- **`getExplanation` returns `null`, not a throw, for a missing pair.** Not
  every result is explained; "no explanation" is a state the UI renders. An
  unknown _run_, by contrast, throws — that one is a mistake.

## Consequences

**Good.** The Pages demo works with no server. The test suite needs no Python.
Pointing this at a real retriever is one file, and every screen keeps working
because no screen knows where its data came from.

**Cost.** Two implementations to keep in step. The mitigation is that both
validate against the same zod schemas, and the fixture tests assert properties
of the data itself — contiguous ranks, descending scores, attribution shares
summing to 1 — so a drift in either direction fails a test rather than
producing a plausible-looking wrong screen.

## Alternatives considered

**Fetch directly from the Python tools, no interface.** Simplest, and it makes
the demo impossible. Rejected on that alone.

**Bundle a WASM build of the retriever.** Genuinely appealing: real retrieval in
the browser with no backend. Rejected as a much larger project than the UI it
would serve, and it would still not solve pointing the tool at someone else's
index — which is the actual use case.

**Static JSON with no interface, live mode later.** The same thing this ADR
describes, minus the seam that makes "later" possible. The interface is 30
lines; deferring it means rewriting every screen when the time comes.
