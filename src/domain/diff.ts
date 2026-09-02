// Comparing two retrieval runs.
//
// The model is deliberately git-shaped, because that is the mental model people
// already have for "what changed": every chunk is added, removed, moved,
// rescored, or unchanged. The point is to make a retrieval regression
// reviewable — an embedding-model bump that quietly drops the one chunk your
// answer depended on should look like a deleted line, not like a number that
// moved.
//
// Sign convention: `rankDelta = candidateRank − baseRank`, so **negative means
// promoted**. That reads backwards at first glance, and the alternative reads
// backwards forever — rank is an axis where lower is better, and inverting the
// delta would mean "+2" sometimes means better and sometimes worse depending on
// which number you are looking at.

export interface RankedEntry {
  id: string;
  rank: number;
  score: number;
}

export type ChangeKind =
  'unchanged' | 'moved' | 'rescored' | 'added' | 'removed';

export interface DiffRow {
  id: string;
  change: ChangeKind;
  baseRank: number | null;
  candidateRank: number | null;
  /** candidate − base. Negative is a promotion. Null when one side is missing. */
  rankDelta: number | null;
  baseScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
}

/** Scores are floats; below this they are the same number with noise on top. */
const SCORE_EPSILON = 1e-9;

export function diffRankings(
  base: readonly RankedEntry[],
  candidate: readonly RankedEntry[],
): DiffRow[] {
  const baseById = new Map(base.map((entry) => [entry.id, entry]));
  const candidateById = new Map(candidate.map((entry) => [entry.id, entry]));

  // The candidate drives the reading order: it is what the user is evaluating.
  const rows: DiffRow[] = candidate.map((entry) => {
    const previous = baseById.get(entry.id);

    if (!previous) {
      return {
        id: entry.id,
        change: 'added',
        baseRank: null,
        candidateRank: entry.rank,
        rankDelta: null,
        baseScore: null,
        candidateScore: entry.score,
        scoreDelta: null,
      };
    }

    const rankDelta = entry.rank - previous.rank;
    const scoreDelta = entry.score - previous.score;
    const change: ChangeKind =
      rankDelta !== 0
        ? 'moved'
        : Math.abs(scoreDelta) > SCORE_EPSILON
          ? 'rescored'
          : 'unchanged';

    return {
      id: entry.id,
      change,
      baseRank: previous.rank,
      candidateRank: entry.rank,
      rankDelta,
      baseScore: previous.score,
      candidateScore: entry.score,
      scoreDelta,
    };
  });

  // Removals have no position in the candidate to sort into, so they go last,
  // in their baseline order.
  for (const entry of base) {
    if (candidateById.has(entry.id)) continue;
    rows.push({
      id: entry.id,
      change: 'removed',
      baseRank: entry.rank,
      candidateRank: null,
      rankDelta: null,
      baseScore: entry.score,
      candidateScore: null,
      scoreDelta: null,
    });
  }

  return rows;
}

/**
 * How much the ranking moved, normalised to [0, 1].
 *
 * Each chunk in the baseline contributes its displacement divided by the worst
 * displacement possible for that list length. A chunk that fell out of the list
 * entirely is charged the maximum: dropping out is the worst thing that can
 * happen to a chunk, and it must never score as gentler than moving down one
 * place.
 *
 * 0 means the two rankings are identical; 1 means nothing survived.
 */
export function rankChurn(
  baseIds: readonly string[],
  candidateIds: readonly string[],
): number {
  if (baseIds.length === 0) return 0;

  const candidatePosition = new Map(
    candidateIds.map((id, index) => [id, index]),
  );
  const depth = Math.max(baseIds.length, candidateIds.length);
  // Worst case for a chunk that stays in the list, and the charge for one that
  // does not. Guarded so a single-item list does not divide by zero.
  const worst = Math.max(1, depth);

  let total = 0;
  for (const [baseIndex, id] of baseIds.entries()) {
    const candidateIndex = candidatePosition.get(id);
    total +=
      candidateIndex === undefined
        ? 1
        : Math.min(1, Math.abs(candidateIndex - baseIndex) / worst);
  }

  return total / baseIds.length;
}
