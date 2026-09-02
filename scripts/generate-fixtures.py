"""Generate the rag-inspector fixture set from real why-this-chunk output.

One coherent dataset rather than two stitched together: the same eight-chunk
corpus produces the retrieval runs, the ground truth and the explanations, so a
chunk's text on the detail screen is the text the run actually ranked.

Two runs come from two embedding configurations — the same "did the model bump
break retrieval?" scenario these tools exist to answer.

Offline and deterministic: the hashing embedder needs no download and no
network, so re-running produces byte-identical fixtures.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Point this at a checkout of https://github.com/mykolapodpriatov/why-this-chunk.
# The fixtures are committed, so this script only needs running when the corpus
# or the retriever configuration changes.
WTC = Path(
    os.environ.get(
        "WHY_THIS_CHUNK_PATH",
        str(Path(__file__).resolve().parents[2] / "why-this-chunk"),
    )
)
sys.path.insert(0, str(WTC / "src"))

from why_this_chunk.attribution import explain_chunk
from why_this_chunk.corpus import Corpus
from why_this_chunk.embedders.fake import FakeEmbedder
from why_this_chunk.retrievers.bm25 import BM25Retriever
from why_this_chunk.retrievers.dense import DenseRetriever
from why_this_chunk.retrievers.hybrid import HybridRetriever
from why_this_chunk.types import Chunk

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "src/fixtures/runs.json")
K = 5

corpus_rows = [
    json.loads(line)
    for line in (WTC / "examples" / "corpus.jsonl").read_text().splitlines()
    if line.strip()
]
query_rows = [
    json.loads(line)
    for line in (WTC / "examples" / "queries.jsonl").read_text().splitlines()
    if line.strip()
]

corpus = Corpus.from_chunks(
    [Chunk(id=row["id"], text=row["text"]) for row in corpus_rows]
)

# Two configurations: a lexical-leaning baseline and a dense-leaning candidate
# on a wider embedding. This is the shape of a real "we changed the retriever"
# comparison, and it produces genuine adds, drops and rank moves.
CONFIGS = [
    {"id": "baseline", "label": "baseline · hash-48 · alpha 0.5", "dim": 48, "alpha": 0.5},
    {"id": "candidate", "label": "candidate · hash-128 · alpha 0.8", "dim": 128, "alpha": 0.8},
]

runs = []
explanations = []

for config in CONFIGS:
    embedder = FakeEmbedder(dim=config["dim"])
    retriever = HybridRetriever(
        DenseRetriever(corpus, embedder),
        BM25Retriever(corpus),
        alpha=config["alpha"],
    )

    queries = []
    for row in query_rows:
        query = row["query"]
        results = retriever.search(query, k=K)
        queries.append(
            {
                "query": query,
                "relevantChunkIds": [row["expect"]],
                "results": [
                    {
                        "chunk": {"id": r.chunk.id, "text": r.chunk.text},
                        "score": r.score,
                        "rank": rank,
                        **(
                            {
                                "components": {
                                    "dense": r.components.dense,
                                    "lexical": r.components.lexical,
                                    "alpha": r.components.alpha,
                                }
                            }
                            if r.components is not None
                            else {}
                        ),
                    }
                    for rank, r in enumerate(results)
                ],
            }
        )

        # Explain the top three of each query: enough for the detail screen to
        # be useful without generating fixtures nobody opens.
        for result in results[:3]:
            explanation = explain_chunk(retriever, query, result)
            explanations.append(
                {
                    "runId": config["id"],
                    "query": query,
                    "chunkId": result.chunk.id,
                    "granularity": explanation.granularity,
                    "degenerate": explanation.degenerate,
                    "sentences": [
                        {"sentence": s.sentence, "delta": s.delta, "share": s.share}
                        for s in explanation.sentences
                    ],
                    "components": (
                        {
                            "dense": explanation.split.dense_n,
                            "lexical": explanation.split.lexical_n,
                            "alpha": explanation.split.alpha,
                            "denseContribution": explanation.split.dense_contribution,
                            "lexicalContribution": explanation.split.lexical_contribution,
                            "dominant": explanation.split.dominant,
                        }
                        if explanation.split is not None
                        else None
                    ),
                }
            )

    runs.append(
        {
            "id": config["id"],
            "label": config["label"],
            "k": K,
            "fingerprint": {
                "embeddingModel": f"fake-hash-{config['dim']}",
                "alpha": config["alpha"],
                "reranker": None,
                "indexContentHash": corpus.content_hash()
                if hasattr(corpus, "content_hash")
                else "",
                "digest": f"{config['id']}-{config['dim']}-{config['alpha']}",
                "chunkParams": {},
            },
            "queries": queries,
        }
    )

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    json.dumps({"runs": runs, "explanations": explanations}, indent=2) + "\n"
)
print(
    f"wrote {OUT} — {len(runs)} runs, "
    f"{sum(len(r['queries']) for r in runs)} query results, "
    f"{len(explanations)} explanations"
)
