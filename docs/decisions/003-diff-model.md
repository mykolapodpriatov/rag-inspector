# ADR 003 — The diff model, and why rank deltas are negative when things improve

**Status:** accepted · **Date:** 2026-09-02

## Context

Comparing two retrieval runs is the second half of this tool. An embedding-model
bump, a chunking change or a reindex moves results around, and the question is
always the same: _did that break anything?_

Two lists of chunk ids side by side do not answer it. The reader has to hold
both in their head and spot the difference, which is exactly the task humans are
worst at.

## Decision

Model the comparison as a **diff**, because that is the mental model people
already have for "what changed". Every chunk is exactly one of:

| Change      | Meaning                        |
| ----------- | ------------------------------ |
| `unchanged` | same rank, same score          |
| `rescored`  | same rank, different score     |
| `moved`     | different rank                 |
| `added`     | only the candidate returned it |
| `removed`   | only the baseline returned it  |

Chunks are matched **by id**, not by position or by text similarity. Ids are
what a retriever returns and what a CI gate asserts on; matching by anything
fuzzier would introduce judgement calls into a comparison whose whole value is
that it has none.

Rows are ordered by the **candidate** ranking, because the candidate is what the
reader is evaluating. Removals have no position in it and go last.

### The sign convention

`rankDelta = candidateRank − baseRank`, so **negative means promoted**.

This reads backwards for a second. The alternative reads backwards forever: rank
is an axis where lower is better, so inverting the delta would make `+2` mean
"better" in the delta column and "worse" in the rank columns beside it. One
second of confusion at first read beats a permanent inconsistency.

### Rank churn

A single number for "how much moved", normalised to `[0, 1]`. Each baseline
chunk contributes its displacement over the worst displacement possible for that
list length, and **a chunk that fell out of the list entirely is charged the
maximum**. Dropping out is the worst thing that can happen to a chunk; it must
never score as gentler than moving down one place, and there is a test asserting
exactly that.

## Consequences

**Good.** "Did the model bump break anything?" has an answer you can point at. A
dropped golden chunk reads like a deleted line rather than a number that moved.
The model is a pure function, so it is tested exhaustively — empty runs,
different depths, disjoint sets, float noise in scores.

**Cost.** Matching by id means a re-chunked index, where every id changed, reads
as "everything removed, everything added". That is technically true and
practically useless. Handling it needs content-based matching, which is a
different feature with its own judgement calls; it is tracked as an issue rather
than half-built here.

**Score epsilon.** Scores are floats, so `rescored` uses a `1e-9` threshold.
Without it, arithmetic noise would report changes that did not happen, and a
diff that cries wolf is a diff people stop reading.

## Alternatives considered

**Show the two rankings side by side and let the reader compare.** Honest and
useless — it is the task the tool exists to remove.

**Longest-common-subsequence diff, as git uses on lines.** Right for text, wrong
here: retrieval results are a ranked set, not a sequence, and LCS would report a
reordering as a delete plus an insert instead of a move.

**A single "regression / no regression" verdict.** Tempting for a CI gate, and
`retrieval-diff` already provides one. This tool is for the moment _after_ the
gate fails, when someone needs to see what actually happened.
