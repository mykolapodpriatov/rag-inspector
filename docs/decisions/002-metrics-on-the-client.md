# ADR 002 — Metrics are computed on the client, and return null when undefined

**Status:** accepted · **Date:** 2026-09-02

## Context

Precision@K, Recall@K, MRR and nDCG could be computed by the backend and sent
as numbers. They are cheap, and a run already carries everything they need: the
ranked ids and the declared relevant ids.

The question that actually matters is a different one: **what does a metric show
for a query nobody has labelled?**

## Decision

Compute them in `src/domain/metrics.ts`, from the same data the screen is
already displaying. And return `null` — not `0` — when there is no ground truth.

`0` and `null` are different facts:

- **`0.000`** means the retriever surfaced nothing relevant. That is a failure.
- **`—`** means nobody has said what relevant would be. That is a gap in the
  dataset.

A dashboard showing `0.00` next to an unlabelled query **will be believed**, and
the reader will conclude the retriever failed. That is the single easiest way
for a metrics panel to be confidently wrong, and it is one `?? 0` away at every
layer — so the null flows all the way to the component, which renders an em dash
and explains it in text for screen readers.

The one exception is reciprocal rank, which is genuinely `0` when a _labelled_
query surfaced none of its relevant chunks: there the retriever really did fail.

## Two edge cases decided rather than left to chance

**A duplicated chunk is credited once but still charged for its slot.**
Collapsing duplicates on both sides reports `['a','a','b']` against relevant
`['a']` as `1/2` — "half the context was useful" — when a third of it was. The
retriever spent three of the user's context slots to deliver one useful chunk.
This surfaced as a real disagreement between a test and an implementation; both
readings were defensible and the harsher one is honest for RAG, where the
context window is the scarce resource.

**nDCG and average precision cap the ideal ranking at K.** With four relevant
chunks and `K = 2`, the best achievable result is two hits; dividing by a
four-hit ideal would mean a perfect retriever could never score 1.

## Consequences

**Good.** No backend needed for the demo. The metrics are unit-tested against
hand-computed values, which is only practical because they are ordinary
functions in this repository. A reader can open one file and check the maths.

**Cost.** A backend that computes its own metrics differently would disagree
with this UI, and the UI would be the one that looks wrong. Mitigated by testing
every formula against a value written out by hand in a comment — checking a
metric against another implementation of the same formula proves only that two
things agree, including when both are wrong.

**Also.** Metrics run on the top-K the UI has, not on the full result set. For a
run captured at K = 5 those are the same thing; for a deeper index they would
not be, and that is a limitation to state rather than paper over.

## Alternatives considered

**Backend-computed metrics.** Correct for large result sets and necessary if the
metric ever needs the whole corpus. Rejected for v1 because it makes the demo
impossible and moves the most testable code in the project out of reach.

**A metrics library.** There are good ones. Rejected because the total is about
120 lines, the edge cases above are decisions rather than defaults, and a
dependency would hide them.
