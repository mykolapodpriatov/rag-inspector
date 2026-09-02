import { describe, expect, it } from 'vitest';

import { diffRankings, rankChurn } from './diff';

const scored = (entries: Array<[string, number]>) =>
  entries.map(([id, score], rank) => ({ id, score, rank }));

describe('diffRankings', () => {
  it('marks a chunk that held its position as unchanged', () => {
    const diff = diffRankings(scored([['a', 0.9]]), scored([['a', 0.9]]));

    expect(diff).toEqual([
      {
        id: 'a',
        change: 'unchanged',
        baseRank: 0,
        candidateRank: 0,
        rankDelta: 0,
        baseScore: 0.9,
        candidateScore: 0.9,
        scoreDelta: 0,
      },
    ]);
  });

  it('reports a promotion with a negative rank delta', () => {
    // Rank 2 → rank 0 is an improvement. The delta is candidate − base = −2,
    // so the sign matches the axis: lower rank is better.
    const diff = diffRankings(
      scored([
        ['x', 0.9],
        ['y', 0.8],
        ['a', 0.7],
      ]),
      scored([
        ['a', 0.95],
        ['x', 0.9],
        ['y', 0.8],
      ]),
    );

    expect(diff.find((row) => row.id === 'a')).toMatchObject({
      change: 'moved',
      rankDelta: -2,
      baseRank: 2,
      candidateRank: 0,
    });
  });

  it('reports a demotion with a positive rank delta', () => {
    const diff = diffRankings(
      scored([
        ['a', 0.9],
        ['b', 0.8],
      ]),
      scored([
        ['b', 0.9],
        ['a', 0.7],
      ]),
    );

    expect(diff.find((row) => row.id === 'a')).toMatchObject({
      change: 'moved',
      rankDelta: 1,
    });
  });

  it('marks a chunk only the candidate returned as added', () => {
    const diff = diffRankings(
      scored([['a', 0.9]]),
      scored([
        ['a', 0.9],
        ['new', 0.5],
      ]),
    );

    expect(diff.find((row) => row.id === 'new')).toMatchObject({
      change: 'added',
      baseRank: null,
      candidateRank: 1,
      rankDelta: null,
      baseScore: null,
    });
  });

  it('marks a chunk only the baseline returned as removed', () => {
    const diff = diffRankings(
      scored([
        ['a', 0.9],
        ['gone', 0.5],
      ]),
      scored([['a', 0.9]]),
    );

    expect(diff.find((row) => row.id === 'gone')).toMatchObject({
      change: 'removed',
      candidateRank: null,
      candidateScore: null,
    });
  });

  it('reports a score change at an unchanged rank', () => {
    // Same position, different score: a reindex or a model swap moved the
    // number without moving the ordering, which is worth seeing.
    const diff = diffRankings(scored([['a', 0.9]]), scored([['a', 0.72]]));

    expect(diff[0]).toMatchObject({
      change: 'rescored',
      rankDelta: 0,
    });
    expect(diff[0]?.scoreDelta).toBeCloseTo(-0.18, 10);
  });

  it('orders rows by the candidate ranking, with removals last', () => {
    // The candidate is what the user is evaluating, so it drives the reading
    // order; a chunk that no longer appears has no position to sort into.
    const diff = diffRankings(
      scored([
        ['gone', 0.9],
        ['a', 0.8],
      ]),
      scored([
        ['b', 0.95],
        ['a', 0.8],
      ]),
    );

    expect(diff.map((row) => row.id)).toEqual(['b', 'a', 'gone']);
  });

  it('handles two runs with nothing in common', () => {
    const diff = diffRankings(scored([['a', 0.9]]), scored([['b', 0.9]]));

    expect(diff.map((row) => [row.id, row.change])).toEqual([
      ['b', 'added'],
      ['a', 'removed'],
    ]);
  });

  it('handles an empty baseline', () => {
    const diff = diffRankings([], scored([['a', 0.9]]));

    expect(diff).toHaveLength(1);
    expect(diff[0]?.change).toBe('added');
  });

  it('handles both runs being empty', () => {
    expect(diffRankings([], [])).toEqual([]);
  });

  it('copes with runs of different depth', () => {
    const diff = diffRankings(
      scored([
        ['a', 0.9],
        ['b', 0.8],
        ['c', 0.7],
      ]),
      scored([['a', 0.9]]),
    );

    expect(diff.filter((row) => row.change === 'removed')).toHaveLength(2);
  });
});

describe('rankChurn', () => {
  it('is 0 for identical rankings', () => {
    expect(rankChurn(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
  });

  it('is 1 when nothing survives', () => {
    expect(rankChurn(['a', 'b'], ['x', 'y'])).toBe(1);
  });

  it('is between 0 and 1 for a partial reshuffle', () => {
    const churn = rankChurn(['a', 'b', 'c'], ['c', 'a', 'b']);

    expect(churn).toBeGreaterThan(0);
    expect(churn).toBeLessThan(1);
  });

  it('reports more churn for a bigger reshuffle', () => {
    const small = rankChurn(['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd']);
    const large = rankChurn(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a']);

    expect(large).toBeGreaterThan(small);
  });

  it('treats a dropped chunk as maximal movement for that chunk', () => {
    // Falling out of the list entirely is the worst thing that can happen to a
    // chunk, so it must not score as less churn than moving down one place.
    const dropped = rankChurn(['a', 'b', 'c'], ['b', 'c', 'z']);
    const nudged = rankChurn(['a', 'b', 'c'], ['b', 'a', 'c']);

    expect(dropped).toBeGreaterThan(nudged);
  });

  it('is 0 for two empty rankings rather than undefined', () => {
    expect(rankChurn([], [])).toBe(0);
  });
});
