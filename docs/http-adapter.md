# A reference FastAPI adapter for `httpSource`

`httpSource` (`src/data/httpSource.ts`) is the client half of a three-endpoint
contract. Point it at a server that implements these three routes and every
screen in the app works against a live retriever, unchanged:

```
GET /runs                                  -> RunSummary[]
GET /runs/:id                              -> RetrievalRun
GET /runs/:id/explanation?query=&chunkId=  -> Explanation | 404
```

Nothing here ships as a package. The point of this file is to be read and
adapted, not installed: copy the code block below into your own service (a
route on an existing FastAPI app, a small standalone one, whatever fits your
deployment) and change the parts marked in the comments. See [ADR
001](decisions/001-adapter-based-sources.md) for why the interface looks like
this in the first place.

## What it wraps

[`why-this-chunk`](https://github.com/mykolapodpriatov/why-this-chunk) already
does the hard part: retrieval, sentence-level occlusion attribution, and the
lexical-versus-dense split for hybrid search. This adapter is the glue between
its Python dataclasses and the JSON shapes `httpSource` validates with zod. It
is deliberately thin:

- `why_this_chunk.retrievers.Retriever` (`BM25Retriever`, `DenseRetriever`,
  `HybridRetriever`) does the search.
- `why_this_chunk.attribution.explain_chunk` does the attribution.
- This file maps their output field-for-field into `RunSummary`,
  `RetrievalRun`, and `Explanation`, matching `src/data/schema.ts`.

`why-this-chunk` also ships its own optional inspector
(`why_this_chunk.web.create_app`, the `serve` CLI command), but that is a
single ad hoc `/api/explain?query=` endpoint for eyeballing one retriever in a
browser. It does not know about "runs" as rag-inspector uses the term, and it
does not implement this contract. The two are unrelated apps that happen to
share a dependency.

One concept this adapter has to invent: **why-this-chunk has no notion of a
saved run.** A run, in the rag-inspector sense, is one retriever configuration
evaluated over a fixed set of queries. The `RUNS` registry below is where that
concept gets created; extend it with your own configurations, or replace it
with something reading from wherever your team already keeps indexed
snapshots.

## Install

```bash
pip install 'why-this-chunk[web]'
```

The `web` extra pulls in `fastapi` and `uvicorn`, which is everything this
file needs beyond `why-this-chunk` itself.

## The adapter

Save this as `http_adapter.py` and adjust the corpus, embedder, and `RUNS`
registry to your own index.

```python
"""Reference FastAPI adapter for rag-inspector's httpSource.

Implements the three-endpoint contract in docs/http-adapter.md by wrapping
why-this-chunk's retriever and attribution. Copy this file, then change the
sections marked below: the corpus, the embedder, and the RUNS registry.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from why_this_chunk import (
    BM25Retriever,
    Chunk,
    Corpus,
    DenseRetriever,
    FakeEmbedder,
    HybridRetriever,
    ScoreComponents,
    ScoredChunk,
    explain_chunk,
)
from why_this_chunk.retrievers import Retriever
from why_this_chunk.types import Explanation

# ---------------------------------------------------------------------------
# 1. The corpus and embedder. Replace this with however your team builds its
#    own index; nothing past this point depends on how the chunks got here.
# ---------------------------------------------------------------------------

CORPUS = Corpus.from_chunks(
    [
        Chunk(id="paris", text="The capital of France is Paris. It sits on the "
              "banks of the Seine river in the north of the country."),
        Chunk(id="eiffel", text="The Eiffel Tower is a wrought-iron lattice "
              "tower in Paris, France. It was completed in 1889 for the "
              "World's Fair."),
        Chunk(id="seine", text="The Seine is a major river of northern "
              "France. It flows through Paris before reaching the English "
              "Channel."),
        Chunk(id="python", text="Python is a high-level programming "
              "language. It is widely used for data science, scripting, "
              "and web development."),
        Chunk(id="numpy", text="NumPy is a Python library for numerical "
              "computing. It provides fast multi-dimensional array "
              "operations."),
        Chunk(id="banana", text="Bananas are an elongated edible fruit. "
              "They are rich in potassium and grow in tropical climates."),
        Chunk(id="photosynthesis", text="Photosynthesis converts light "
              "energy into chemical energy. Plants use chlorophyll to "
              "absorb sunlight and release oxygen."),
        Chunk(id="mitochondria", text="The mitochondria are the powerhouse "
              "of the cell. They produce ATP, the energy currency that "
              "drives cellular metabolism."),
    ]
)

# FakeEmbedder is why-this-chunk's deterministic, offline embedder: no model
# download, so this file runs standalone. Swap it for your real embedder and
# give it a real name below; nothing else in this file changes.
EMBEDDING_MODEL_NAME = "fake-hashing-v1"
_embedder = FakeEmbedder(seed=0)
_dense = DenseRetriever(CORPUS, _embedder)
_lexical = BM25Retriever(CORPUS)

# ---------------------------------------------------------------------------
# 2. The runs this server exposes: one retriever configuration each, over a
#    fixed set of queries. Add your own configurations here, or replace this
#    static dict with a lookup into wherever your snapshots actually live.
# ---------------------------------------------------------------------------

QUERIES = [
    "What is the capital of France?",
    "NumPy fast numerical arrays for Python data science",
]
TOP_K = 3


@dataclass(frozen=True)
class Run:
    label: str
    retriever: Retriever
    alpha: float | None


RUNS: dict[str, Run] = {
    "hybrid-default": Run(
        label="hybrid (alpha=0.5)",
        retriever=HybridRetriever(_dense, _lexical, alpha=0.5),
        alpha=0.5,
    ),
    "dense-only": Run(
        label="dense only",
        retriever=_dense,
        alpha=None,
    ),
}

# ---------------------------------------------------------------------------
# 3. Fingerprint. Field names mirror retrieval-diff's lockfile (embeddingModel
#    / alpha / reranker / indexContentHash / digest / chunkParams), and
#    index_content_hash below uses the same length-prefixed framing as
#    retrieval_diff.fingerprint.index_content_hash, so the two are
#    byte-for-byte comparable for an identical corpus. Not a dependency on
#    retrieval-diff, just the same convention.
# ---------------------------------------------------------------------------


def _index_content_hash(corpus: Corpus) -> str:
    pairs = sorted(
        ((c.id.encode("utf-8"), c.text.encode("utf-8")) for c in corpus),
        key=lambda pair: pair[0],
    )
    hasher = hashlib.sha256()
    for id_bytes, text_bytes in pairs:
        hasher.update(len(id_bytes).to_bytes(8, "big"))
        hasher.update(id_bytes)
        hasher.update(len(text_bytes).to_bytes(8, "big"))
        hasher.update(text_bytes)
    return hasher.hexdigest()


_INDEX_CONTENT_HASH = _index_content_hash(CORPUS)


def _fingerprint(run: Run) -> dict[str, Any]:
    # Empty because CORPUS is pre-chunked (Corpus.from_chunks). If you build
    # your corpus from raw documents with a Chunker instead, put chunk_size /
    # overlap here.
    chunk_params: dict[str, Any] = {}
    canonical = json.dumps(
        {
            "alpha": run.alpha,
            "chunkParams": chunk_params,
            "embeddingModel": EMBEDDING_MODEL_NAME,
            "indexContentHash": _INDEX_CONTENT_HASH,
            "reranker": None,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "embeddingModel": EMBEDDING_MODEL_NAME,
        "alpha": run.alpha,
        "reranker": None,
        "indexContentHash": _INDEX_CONTENT_HASH,
        "digest": digest,
        "chunkParams": chunk_params,
    }


# ---------------------------------------------------------------------------
# 4. Wire mapping: why-this-chunk dataclasses -> the JSON shapes httpSource.ts
#    validates with zod. Field-for-field, no renaming beyond snake_case to
#    camelCase, per ADR 001.
# ---------------------------------------------------------------------------


def _chunk_wire(chunk: Chunk) -> dict[str, Any]:
    wire: dict[str, Any] = {"id": chunk.id, "text": chunk.text}
    if chunk.source_document_id is not None:
        wire["sourceDocumentId"] = chunk.source_document_id
    return wire


def _components_wire(components: ScoreComponents | None) -> dict[str, Any] | None:
    if components is None:
        return None
    return {
        "dense": components.dense,
        "lexical": components.lexical,
        "alpha": components.alpha,
        "denseRaw": components.dense_raw,
        "lexicalRaw": components.lexical_raw,
    }


def _scored_chunk_wire(result: ScoredChunk) -> dict[str, Any]:
    wire: dict[str, Any] = {
        "chunk": _chunk_wire(result.chunk),
        "score": result.score,
        "rank": result.rank,
    }
    components = _components_wire(result.components)
    if components is not None:
        wire["components"] = components
    return wire


def _run_summary(run_id: str, run: Run) -> dict[str, Any]:
    return {
        "id": run_id,
        "label": run.label,
        "k": TOP_K,
        "queryCount": len(QUERIES),
        "embeddingModel": EMBEDDING_MODEL_NAME,
    }


def _run_wire(run_id: str, run: Run) -> dict[str, Any]:
    return {
        "id": run_id,
        "label": run.label,
        "k": TOP_K,
        "fingerprint": _fingerprint(run),
        "queries": [
            {
                "query": query,
                "results": [
                    _scored_chunk_wire(r) for r in run.retriever.search(query, TOP_K)
                ],
            }
            for query in QUERIES
        ],
    }


def _explanation_wire(run_id: str, explanation: Explanation) -> dict[str, Any]:
    wire: dict[str, Any] = {
        "runId": run_id,
        "query": explanation.query,
        "chunkId": explanation.result.chunk.id,
        "granularity": explanation.granularity,
        "degenerate": explanation.degenerate,
        "sentences": [
            {
                "sentence": s.sentence,
                "start": s.span[0],
                "end": s.span[1],
                "delta": s.delta,
                "share": s.share,
            }
            for s in explanation.sentences
        ],
    }
    if explanation.split is not None:
        split = explanation.split
        wire["components"] = {
            "dense": split.dense_n,
            "lexical": split.lexical_n,
            "alpha": split.alpha,
            "denseContribution": split.dense_contribution,
            "lexicalContribution": split.lexical_contribution,
            "dominant": split.dominant,
        }
    return wire


def _find_result(run: Run, query: str, chunk_id: str) -> ScoredChunk | None:
    # Only chunks within the run's own top-k are explainable, which is the
    # case the UI actually hits: a client only ever sees a chunk id by first
    # reading it off a run's results. A chunk that exists in the corpus but
    # fell outside top-k for this query is treated the same as "never
    # explained": a 404, not a 500 and not a silent re-score outside the
    # ranking the run actually reported.
    for result in run.retriever.search(query, TOP_K):
        if result.chunk.id == chunk_id:
            return result
    return None


# ---------------------------------------------------------------------------
# 5. The three endpoints.
# ---------------------------------------------------------------------------

app = FastAPI(title="rag-inspector reference adapter")

# The UI runs in a browser on a different origin than this server (the Pages
# demo, or `pnpm dev` on localhost:5173). Restrict this to your own origins
# before deploying anywhere reachable.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
)


@app.get("/runs")
def list_runs() -> list[dict[str, Any]]:
    return [_run_summary(run_id, run) for run_id, run in RUNS.items()]


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"no run {run_id!r}")
    return _run_wire(run_id, run)


@app.get("/runs/{run_id}/explanation")
def get_explanation(
    run_id: str,
    query: str = Query(..., min_length=1),
    chunk_id: str = Query(..., alias="chunkId", min_length=1),
) -> dict[str, Any]:
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"no run {run_id!r}")
    result = _find_result(run, query, chunk_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail="no explanation for this (query, chunkId) pair"
        )
    explanation = explain_chunk(run.retriever, query, result)
    return _explanation_wire(run_id, explanation)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
```

## Running it

```bash
python http_adapter.py
# or: uvicorn http_adapter:app --reload --port 8000
```

Then point `httpSource` at it:

```tsx
<SourceProvider source={createHttpSource({ baseUrl: 'http://127.0.0.1:8000' })}>
```

## Example responses

These are the real, deterministic responses the adapter above produces (the
`fake-hashing-v1` embedder has no randomness, so re-running it reproduces the
same numbers).

`GET /runs`:

```json
[
  {
    "id": "hybrid-default",
    "label": "hybrid (alpha=0.5)",
    "k": 3,
    "queryCount": 2,
    "embeddingModel": "fake-hashing-v1"
  },
  {
    "id": "dense-only",
    "label": "dense only",
    "k": 3,
    "queryCount": 2,
    "embeddingModel": "fake-hashing-v1"
  }
]
```

`GET /runs/hybrid-default` (one query shown; the second follows the same
shape):

```json
{
  "id": "hybrid-default",
  "label": "hybrid (alpha=0.5)",
  "k": 3,
  "fingerprint": {
    "embeddingModel": "fake-hashing-v1",
    "alpha": 0.5,
    "reranker": null,
    "indexContentHash": "d5237965f036cd7ba079e9237b3d9ebd5c135d7a6b4db0978fde75963a96a1eb",
    "digest": "3bea1a38f48b898b3205a8fb32d99a7d53b5270ccf17e6d51fc4b93ee192a683",
    "chunkParams": {}
  },
  "queries": [
    {
      "query": "What is the capital of France?",
      "results": [
        {
          "chunk": {
            "id": "paris",
            "text": "The capital of France is Paris. It sits on the banks of the Seine river in the north of the country."
          },
          "score": 1.0,
          "rank": 0,
          "components": {
            "dense": 1.0,
            "lexical": 1.0,
            "alpha": 0.5,
            "denseRaw": 0.6694387197494507,
            "lexicalRaw": 2.9704891918560907
          }
        },
        {
          "chunk": {
            "id": "seine",
            "text": "The Seine is a major river of northern France. It flows through Paris before reaching the English Channel."
          },
          "score": 0.4486605091612123,
          "rank": 1,
          "components": {
            "dense": 0.473684169830851,
            "lexical": 0.4236368484915736,
            "alpha": 0.5,
            "denseRaw": 0.3651483654975891,
            "lexicalRaw": 1.2584086797161957
          }
        }
      ]
    }
  ]
}
```

Note `alpha: null` on the `dense-only` run's fingerprint instead of a made-up
value: that retriever has no fusion weight, and the schema treats absence as a
distinct, real fact rather than defaulting it to something plausible-looking.

`GET /runs/hybrid-default/explanation?query=What+is+the+capital+of+France%3F&chunkId=paris`:

```json
{
  "runId": "hybrid-default",
  "query": "What is the capital of France?",
  "chunkId": "paris",
  "granularity": "sentence",
  "degenerate": false,
  "sentences": [
    {
      "sentence": "The capital of France is Paris.",
      "start": 0,
      "end": 31,
      "delta": 0.5564283668794713,
      "share": 1.0
    },
    {
      "sentence": "It sits on the banks of the Seine river in the north of the country.",
      "start": 32,
      "end": 100,
      "delta": 0.0,
      "share": 0.0
    }
  ],
  "components": {
    "dense": 1.0,
    "lexical": 1.0,
    "alpha": 0.5,
    "denseContribution": 0.5,
    "lexicalContribution": 0.5,
    "dominant": "dense"
  }
}
```

The same call against the `dense-only` run omits `components` entirely rather
than sending a fabricated split: `compute_split` only runs for
`HybridRetriever` results, and this adapter never invents one. A request for a
`chunkId` outside that query's top-`k`, or for an unknown `runId`, returns a
plain `404` with no body the client needs to parse, which is what
`httpSource.ts` already expects: `getRun` turns that into a thrown
`RunNotFoundError`, and `getExplanation` turns it into `null`.

## What to change before this is your adapter

- **The corpus and embedder** (section 1). `FakeEmbedder` exists so this file
  runs with zero downloads; swap it for `SentenceTransformerEmbedder` (or
  whatever you use) and set `EMBEDDING_MODEL_NAME` to something that actually
  identifies it.
- **The `RUNS` registry** (section 2). This reference hardcodes two
  configurations at import time. A real deployment likely wants this backed by
  whatever store already holds your indexed snapshots, built lazily or on a
  schedule rather than once at process start.
- **Reranking**. Wrap a retriever in `why_this_chunk.rerank.RerankingRetriever`
  and pass its model id into the fingerprint's `reranker` field instead of
  `None`; nothing else in the mapping functions changes.
- **CORS origins** (section 5), before this is reachable from anywhere but
  localhost.

## What this reference does not do

No persistence, no authentication, no pagination on `/runs`, and explanations
are only served for chunks already present in a run's own top-`k` results (see
the comment on `_find_result`). Add what your deployment needs; the wire
mapping functions are the part that has to stay faithful to the schemas in
`src/data/schema.ts`.

A contract test asserting these same shape assertions against both
`fixtureSource`'s zod schemas and this adapter's actual output would catch the
two drifting apart. It is left out here: running a Python process from the
Vitest suite is the exact thing [ADR
001](decisions/001-adapter-based-sources.md) decided against for the app's own
tests, so it would need its own harness rather than fitting into the existing
one. Tracked as a follow-up.
