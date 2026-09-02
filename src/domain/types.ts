// The domain vocabulary.
//
// These names and shapes mirror the Python tools this UI explains —
// `why-this-chunk` (src/why_this_chunk/types.py) and `retrieval-diff`
// (examples/retrieval.lock). That is deliberate: if the frontend invented its
// own vocabulary, the adapter to a live backend would become a translation, and
// translations drift from the thing they translate.
//
// Where a name differs it is because the transport name is awkward in a UI
// (`hits` → `results`), never because the concept differs.

/** A retrieved unit of text. `why-this-chunk`: Chunk. */
export interface Chunk {
  id: string;
  text: string;
  sourceDocumentId?: string;
}

/**
 * How a hybrid retriever arrived at a score. `why-this-chunk`: ScoreComponents.
 *
 * All fields are optional because a pure-dense or pure-lexical retriever has no
 * split to report, and reporting zero would be a lie — absent and zero mean
 * different things to anyone reading the chart.
 */
export interface ScoreComponents {
  dense?: number;
  lexical?: number;
  /** Hybrid weight: score = alpha·dense + (1 − alpha)·lexical. */
  alpha?: number;
  denseRaw?: number;
  lexicalRaw?: number;
}

/** One result in a ranked list. */
export interface ScoredChunk {
  chunk: Chunk;
  score: number;
  /** 0-based, as in retrieval.lock. */
  rank: number;
  components?: ScoreComponents;
}

/**
 * The contribution of one sentence to a chunk's score, measured by occlusion.
 * `why-this-chunk`: SentenceAttribution.
 */
export interface SentenceAttribution {
  sentence: string;
  /** Score change when this sentence is removed. Negative means it helped. */
  delta: number;
  /** Share of the total attributed movement, in [0, 1]. */
  share: number;
}

/** Why a chunk scored what it did. `why-this-chunk`: Explanation. */
export interface Explanation {
  query: string;
  chunkId: string;
  sentences: SentenceAttribution[];
  granularity: 'sentence' | 'token';
  components?: ScoreComponents;
}

/** The retriever configuration a run was produced with. `retrieval.lock`: fingerprint. */
export interface RunFingerprint {
  embeddingModel: string;
  alpha: number | null;
  reranker: string | null;
  indexContentHash: string;
  digest: string;
  chunkParams: Record<string, unknown>;
}

/** One query's ranked results within a run. */
export interface QueryResult {
  query: string;
  results: ScoredChunk[];
  /**
   * Chunk ids known to be correct for this query, if the corpus has labels.
   * Absent means "nobody has said" — which is why the metrics return null
   * rather than zero for an unlabelled query.
   */
  relevantChunkIds?: string[];
}

/** A snapshot of a retriever's output. `retrieval.lock`. */
export interface RetrievalRun {
  id: string;
  label: string;
  k: number;
  fingerprint: RunFingerprint;
  queries: QueryResult[];
}
