// Retrieval metrics.
//
// One decision runs through all of them: **an unlabelled query returns `null`,
// not `0`.** Precision of zero means the retriever surfaced nothing relevant;
// null means nobody has said what relevant would be. Collapsing the two makes a
// dashboard confidently wrong, and it is the single easiest way for a metrics
// panel to mislead the person reading it.
//
// The one exception is `reciprocalRank`, which is genuinely 0 when a labelled
// query surfaced none of its relevant chunks — the retriever really did fail.
//
// Every formula here is verified against a hand-computed value in the tests,
// never against another implementation of itself.

export interface MetricSummary {
  k: number;
  precisionAtK: number | null;
  recallAtK: number | null;
  reciprocalRank: number | null;
  ndcgAtK: number | null;
  averagePrecision: number | null;
}

/** Ground truth is usable only if it exists and is non-empty. */
function labelled(relevant: readonly string[] | undefined): Set<string> | null {
  if (!relevant || relevant.length === 0) return null;
  return new Set(relevant);
}

/**
 * The top K as retrieved — duplicates included.
 *
 * Duplicates are counted as *slots*, not as results. A retriever that returns
 * the same chunk twice has spent two of the user's context slots on one piece
 * of text, so the denominator keeps both while `distinctRelevant` credits the
 * chunk once. The alternative — collapsing duplicates on both sides — would
 * report `['a','a','b']` against relevant `['a']` as 1/2, which reads as "half
 * the context was useful" when in truth a third of it was.
 */
function topK(ranked: readonly string[], k: number): string[] {
  return ranked.slice(0, k);
}

/** Distinct relevant ids in a window, so a duplicate is never credited twice. */
function distinctRelevant(
  window: readonly string[],
  truth: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  for (const id of window) {
    if (truth.has(id)) seen.add(id);
  }
  return seen.size;
}

export function precisionAtK(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
  k: number,
): number | null {
  const truth = labelled(relevant);
  if (!truth || k <= 0) return null;

  const window = topK(ranked, k);
  if (window.length === 0) return 0;

  // Divide by what was actually retrieved, not by K: asking for 10 from a
  // 5-result run should not halve the score.
  return distinctRelevant(window, truth) / window.length;
}

export function recallAtK(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
  k: number,
): number | null {
  const truth = labelled(relevant);
  if (!truth || k <= 0) return null;

  const window = new Set(topK(ranked, k));
  let found = 0;
  for (const id of truth) if (window.has(id)) found += 1;
  return found / truth.size;
}

export function reciprocalRank(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
): number | null {
  const truth = labelled(relevant);
  if (!truth) return null;

  const index = ranked.findIndex((id) => truth.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
  k: number,
): number | null {
  const truth = labelled(relevant);
  if (!truth || k <= 0) return null;

  const window = topK(ranked, k);
  const gain = (position: number): number => 1 / Math.log2(position + 2);

  const dcg = window.reduce(
    (total, id, position) => total + (truth.has(id) ? gain(position) : 0),
    0,
  );

  // The ideal ranking is capped at K: with 4 relevant chunks and K = 2 the best
  // achievable result is 2 hits, and dividing by a 4-hit ideal would mean a
  // perfect retriever could never score 1.
  const reachable = Math.min(truth.size, k);
  let idcg = 0;
  for (let position = 0; position < reachable; position += 1) {
    idcg += gain(position);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

export function averagePrecisionAtK(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
  k: number,
): number | null {
  const truth = labelled(relevant);
  if (!truth || k <= 0) return null;

  const window = topK(ranked, k);
  let hits = 0;
  let total = 0;

  for (const [position, id] of window.entries()) {
    if (!truth.has(id)) continue;
    hits += 1;
    total += hits / (position + 1);
  }

  // Same reasoning as nDCG: divide by what could be found within K.
  const reachable = Math.min(truth.size, k);
  return reachable === 0 ? 0 : total / reachable;
}

export function summariseMetrics(
  ranked: readonly string[],
  relevant: readonly string[] | undefined,
  k: number,
): MetricSummary {
  return {
    k,
    precisionAtK: precisionAtK(ranked, relevant, k),
    recallAtK: recallAtK(ranked, relevant, k),
    reciprocalRank: reciprocalRank(ranked, relevant),
    ndcgAtK: ndcgAtK(ranked, relevant, k),
    averagePrecision: averagePrecisionAtK(ranked, relevant, k),
  };
}
