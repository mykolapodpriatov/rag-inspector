import { describe, expect, it } from 'vitest';

import {
  averagePrecisionAtK,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  summariseMetrics,
} from './metrics';

// Every expected value below is computed by hand in the comment above it.
// Checking a metric against another implementation of the same formula proves
// only that two things agree — including when both are wrong.

const RANKED = ['a', 'b', 'c', 'd', 'e'];

describe('precisionAtK', () => {
  it('counts relevant results in the top K', () => {
    // top-3 = a, b, c; relevant among them = a, c → 2/3
    expect(precisionAtK(RANKED, ['a', 'c', 'z'], 3)).toBeCloseTo(2 / 3, 10);
  });

  it('is 1 when every top-K result is relevant', () => {
    expect(precisionAtK(RANKED, ['a', 'b'], 2)).toBe(1);
  });

  it('is 0 when none are', () => {
    expect(precisionAtK(RANKED, ['z'], 3)).toBe(0);
  });

  it('divides by the number of results when K exceeds the list', () => {
    // Only 5 results exist; asking for 10 must not deflate precision to 2/10.
    expect(precisionAtK(RANKED, ['a', 'b'], 10)).toBeCloseTo(2 / 5, 10);
  });

  it('returns null when there is no ground truth', () => {
    // Not zero. An unlabelled query has no precision, and showing 0.00 would
    // read as "the retriever found nothing" rather than "nobody has said".
    expect(precisionAtK(RANKED, undefined, 3)).toBeNull();
    expect(precisionAtK(RANKED, [], 3)).toBeNull();
  });

  it('credits a duplicated chunk once but still charges for the slot', () => {
    // ['a','a','b'] against relevant ['a']: the chunk is counted once, but the
    // retriever spent three context slots to deliver one useful chunk, so the
    // denominator stays 3. Collapsing duplicates on both sides would report
    // 1/2 — "half the context was useful" — which is not what happened.
    expect(precisionAtK(['a', 'a', 'b'], ['a'], 3)).toBeCloseTo(1 / 3, 10);
  });

  it('returns null for a non-positive K', () => {
    expect(precisionAtK(RANKED, ['a'], 0)).toBeNull();
  });
});

describe('recallAtK', () => {
  it('measures how much of the ground truth was found', () => {
    // relevant = a, c, z (3); found in top-3 = a, c → 2/3
    expect(recallAtK(RANKED, ['a', 'c', 'z'], 3)).toBeCloseTo(2 / 3, 10);
  });

  it('is 1 when everything relevant is retrieved', () => {
    expect(recallAtK(RANKED, ['a', 'b'], 3)).toBe(1);
  });

  it('does not exceed 1 when the ground truth repeats an id', () => {
    expect(recallAtK(RANKED, ['a', 'a'], 3)).toBe(1);
  });

  it('returns null without ground truth', () => {
    expect(recallAtK(RANKED, [], 3)).toBeNull();
  });
});

describe('reciprocalRank', () => {
  it('is 1 when the first result is relevant', () => {
    expect(reciprocalRank(RANKED, ['a'])).toBe(1);
  });

  it('is 1/3 when the first relevant result is third', () => {
    expect(reciprocalRank(RANKED, ['c'])).toBeCloseTo(1 / 3, 10);
  });

  it('uses the earliest relevant result, not the best-scoring one', () => {
    expect(reciprocalRank(RANKED, ['e', 'b'])).toBeCloseTo(1 / 2, 10);
  });

  it('is 0 when nothing relevant was retrieved at all', () => {
    // Zero is right here, unlike precision: the query *was* labelled, and the
    // retriever genuinely failed to surface anything.
    expect(reciprocalRank(RANKED, ['z'])).toBe(0);
  });

  it('returns null without ground truth', () => {
    expect(reciprocalRank(RANKED, undefined)).toBeNull();
  });
});

describe('ndcgAtK', () => {
  it('is 1 when relevant results occupy the top positions', () => {
    expect(ndcgAtK(RANKED, ['a', 'b'], 2)).toBeCloseTo(1, 10);
  });

  it('discounts a relevant result that ranks lower', () => {
    // DCG  = 1/log2(3) = 0.63093           (relevant at position 2, 0-based)
    // IDCG = 1/log2(2) = 1                 (ideal: that result first)
    // nDCG = 0.63093
    expect(ndcgAtK(RANKED, ['b'], 3)).toBeCloseTo(0.6309297535714575, 10);
  });

  it('rewards the better ordering of the same two results', () => {
    const better = ndcgAtK(['a', 'z', 'b'], ['a', 'b'], 3);
    const worse = ndcgAtK(['z', 'a', 'b'], ['a', 'b'], 3);

    expect(better).not.toBeNull();
    expect(worse).not.toBeNull();
    expect(Number(better)).toBeGreaterThan(Number(worse));
  });

  it('is 0 when nothing relevant appears in the top K', () => {
    expect(ndcgAtK(RANKED, ['z'], 3)).toBe(0);
  });

  it('caps the ideal ranking at K', () => {
    // 4 relevant items but K = 2: IDCG must use 2 items, or nDCG can never
    // reach 1 and a perfect retriever looks broken.
    expect(ndcgAtK(['a', 'b'], ['a', 'b', 'c', 'd'], 2)).toBeCloseTo(1, 10);
  });

  it('returns null without ground truth', () => {
    expect(ndcgAtK(RANKED, [], 3)).toBeNull();
  });
});

describe('averagePrecisionAtK', () => {
  it('averages precision at each relevant hit', () => {
    // ranked a b c d e, relevant a and c
    // hit at 1 → P@1 = 1/1 = 1
    // hit at 3 → P@3 = 2/3
    // AP = (1 + 0.6667) / 2 = 0.83333
    expect(averagePrecisionAtK(RANKED, ['a', 'c'], 5)).toBeCloseTo(
      0.8333333333333333,
      10,
    );
  });

  it('divides by the reachable number of relevant items, not the total', () => {
    // 3 relevant but K = 2, so at most 2 can be found; dividing by 3 would make
    // a perfect top-2 look like a failure.
    expect(averagePrecisionAtK(['a', 'b'], ['a', 'b', 'z'], 2)).toBeCloseTo(
      1,
      10,
    );
  });
});

describe('summariseMetrics', () => {
  it('reports every metric for a labelled query', () => {
    const summary = summariseMetrics(RANKED, ['a', 'c'], 3);

    expect(summary.precisionAtK).toBeCloseTo(2 / 3, 10);
    expect(summary.recallAtK).toBe(1);
    expect(summary.reciprocalRank).toBe(1);
    expect(summary.ndcgAtK).not.toBeNull();
  });

  it('reports nulls, not zeroes, for an unlabelled query', () => {
    const summary = summariseMetrics(RANKED, undefined, 3);

    expect(summary).toEqual({
      k: 3,
      precisionAtK: null,
      recallAtK: null,
      reciprocalRank: null,
      ndcgAtK: null,
      averagePrecision: null,
    });
  });
});
