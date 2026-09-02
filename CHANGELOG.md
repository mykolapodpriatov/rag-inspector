# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-02

First release. Every claim in the README is backed by a test, a screenshot or a
live URL.

### Added

- **Query screen** — pick a run and a query, see the ranked results with score
  contributions, click a chunk to see why it ranked there.
- **Chunk detail** — sentence-level attribution from occlusion, rendered as a
  heat map over the chunk text and as a table sorted by contribution.
- **Diff screen** — two runs side by side for one query: added, dropped, moved
  and rescored chunks, metric deltas, and rank churn.
- **Retrieval metrics** — Precision@K, Recall@K, MRR, nDCG@K and average
  precision, computed on the client and tested against hand-computed values.
- **`RetrievalSource` interface** with two implementations: recorded fixtures
  (the default, offline) and an HTTP adapter for a live retriever.
- **Generated fixtures** — `scripts/generate-fixtures.py` runs the real
  `why-this-chunk` retriever over its own corpus to produce two configurations
  with declared ground truth.
- **Selection in the URL**, so a finding is a shareable link.
- Dark mode, three ADRs, 84 unit/component tests and 12 Playwright specs.

### Fixed during development

- **The chunk heat map rendered sentences in attribution order**, which is
  descending by contribution — so it showed readers a passage that does not
  exist in the corpus. The sentence span now flows through the generator, the
  schema and the domain type, and the text is sorted back into reading order.
- **A `<label>` wrapping a `<select>` put the control's own value into its
  accessible name**: the candidate field announced itself as "Candidate
  baseline · hash-48 · alpha 0.5". All selects now use explicit association.
- **Result rows announced relevance twice**, once from the visible badge and
  again from an `sr-only` string that repeated it.

### Notes

- Metrics return `null`, rendered as an em dash, for a query with no ground
  truth. `0.00` would read as "the retriever found nothing relevant", which is a
  different and much worse claim.
- A duplicated chunk is credited once but still charged for its context slot.
- Chunks are matched by id across runs, so a re-chunked index reads as
  "everything removed, everything added". Content-based matching is tracked as
  an issue rather than half-built.
