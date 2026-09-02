import { describe, expect, it, vi } from 'vitest';

import { createFixtureSource } from './fixtureSource';
import { createHttpSource, SchemaDriftError } from './httpSource';
import { RunNotFoundError } from './source';

describe('fixture source', () => {
  const source = createFixtureSource();

  it('lists the recorded runs', async () => {
    const runs = await source.listRuns();

    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(runs.map((run) => run.id)).toContain('baseline');
    expect(runs.map((run) => run.id)).toContain('candidate');
  });

  it('reports each run k and query count', async () => {
    const [first] = await source.listRuns();

    expect(first?.k).toBeGreaterThan(0);
    expect(first?.queryCount).toBeGreaterThan(0);
    expect(first?.embeddingModel).not.toBe('');
  });

  it('returns a run with ranked, contiguous results', async () => {
    const run = await source.getRun('baseline');
    const [query] = run.queries;

    expect(query).toBeDefined();
    expect(query?.results.map((result) => result.rank)).toEqual(
      query?.results.map((_, index) => index),
    );
  });

  it('returns results in descending score order', async () => {
    const run = await source.getRun('baseline');

    for (const query of run.queries) {
      const scores = query.results.map((result) => result.score);
      const sorted = [...scores].sort((a, b) => b - a);
      expect(scores).toEqual(sorted);
    }
  });

  it('carries ground truth, so the metrics have something to measure', async () => {
    const run = await source.getRun('baseline');

    for (const query of run.queries) {
      expect(query.relevantChunkIds?.length).toBeGreaterThan(0);
    }
  });

  it('throws a typed error for an unknown run', async () => {
    await expect(source.getRun('nope')).rejects.toBeInstanceOf(
      RunNotFoundError,
    );
  });

  it('returns an explanation whose shares sum to about 1', async () => {
    const run = await source.getRun('baseline');
    const query = run.queries[0];
    if (!query) throw new Error('The baseline fixture has no queries.');
    const top = query.results[0];
    if (!top) throw new Error('The first query has no results.');

    const explanation = await source.getExplanation(
      'baseline',
      query.query,
      top.chunk.id,
    );

    expect(explanation).not.toBeNull();
    const total = (explanation?.sentences ?? []).reduce(
      (sum, sentence) => sum + sentence.share,
      0,
    );
    expect(total).toBeCloseTo(1, 6);
  });

  it('returns null rather than throwing when a pair has no explanation', async () => {
    const run = await source.getRun('baseline');
    const query = run.queries[0];
    if (!query) throw new Error('The baseline fixture has no queries.');

    const explanation = await source.getExplanation(
      'baseline',
      query.query,
      'a-chunk-that-was-never-explained',
    );

    expect(explanation).toBeNull();
  });

  it('rejects a bundle whose shape has drifted', () => {
    // The fixtures are generated; a regenerated file with a renamed field must
    // fail here rather than three components deep.
    expect(() =>
      createFixtureSource({ runs: [{ id: 'x' }], explanations: [] }),
    ).toThrow();
  });
});

describe('http source', () => {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const runSummary = {
    id: 'baseline',
    label: 'baseline',
    k: 5,
    queryCount: 3,
    embeddingModel: 'fake-hash-48',
  };

  it('lists runs from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([runSummary]));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await expect(source.listRuns()).resolves.toEqual([runSummary]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/runs');
  });

  it('strips a trailing slash from the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com/',
      fetch: fetchMock,
    });

    await source.listRuns();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.com/runs');
  });

  it('sends the supplied headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([]));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
      headers: { Authorization: 'Bearer t' },
    });

    await source.listRuns();

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer t',
    );
  });

  it('encodes ids and query text into the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(null, 404));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await source.getExplanation('run/1', 'France river Paris', 'eiffel');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/runs/run%2F1/explanation');
    expect(url).toContain('query=France+river+Paris');
  });

  it('treats 404 on an explanation as "not explained", not as a failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(null, 404));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await expect(
      source.getExplanation('baseline', 'q', 'c'),
    ).resolves.toBeNull();
  });

  it('throws a typed error for an unknown run', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(null, 404));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await expect(source.getRun('nope')).rejects.toBeInstanceOf(
      RunNotFoundError,
    );
  });

  it('surfaces a non-2xx with its status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('boom', { status: 502 }));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await expect(source.listRuns()).rejects.toThrow(/502/);
  });

  it('names schema drift instead of failing deep inside a component', async () => {
    // The backend is someone else's process and will move ahead of the UI. When
    // it does, the error should say so at the boundary.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json([{ id: 'baseline', label: 'baseline' }]));
    const source = createHttpSource({
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    });

    await expect(source.listRuns()).rejects.toBeInstanceOf(SchemaDriftError);
  });

  it('describes itself so the UI can say where the data came from', () => {
    const source = createHttpSource({ baseUrl: 'https://api.example.com' });

    expect(source.name).toContain('api.example.com');
  });
});
