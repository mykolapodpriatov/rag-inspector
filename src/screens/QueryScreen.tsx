import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSource } from '../app/SourceContext';
import { useSelection } from '../app/useSelection';
import { ChunkDetail } from '../components/ChunkDetail';
import { MetricsPanel } from '../components/MetricsPanel';
import { ResultList } from '../components/ResultList';
import { summariseMetrics } from '../domain/metrics';

// The main screen: pick a run, pick a query, see the ranking, click a chunk to
// find out why it is there.
//
// The reading order is deliberate. Metrics come first because they answer "did
// this query work at all?" — and when they say it did not, the ranking below is
// evidence rather than trivia.

export function QueryScreen() {
  const source = useSource();
  const { runId, query, chunkId, select } = useSelection();

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => source.listRuns(),
  });

  const runs = runsQuery.data ?? [];
  const activeRunId = runId ?? runs[0]?.id;

  const runQuery = useQuery({
    queryKey: ['run', activeRunId],
    queryFn: () => source.getRun(activeRunId as string),
    enabled: Boolean(activeRunId),
  });

  const run = runQuery.data;
  // Falling back to the first query rather than rendering empty: an old link
  // whose query has since been removed should still show something useful.
  const activeQuery =
    run?.queries.find((entry) => entry.query === query) ?? run?.queries[0];
  const activeResult =
    activeQuery?.results.find((result) => result.chunk.id === chunkId) ??
    activeQuery?.results[0];

  const explanationQuery = useQuery({
    queryKey: [
      'explanation',
      activeRunId,
      activeQuery?.query,
      activeResult?.chunk.id,
    ],
    queryFn: () =>
      source.getExplanation(
        activeRunId as string,
        activeQuery?.query as string,
        activeResult?.chunk.id as string,
      ),
    enabled: Boolean(activeRunId && activeQuery && activeResult),
  });

  const metrics = useMemo(() => {
    if (!activeQuery || !run) return null;
    return summariseMetrics(
      activeQuery.results.map((result) => result.chunk.id),
      activeQuery.relevantChunkIds,
      run.k,
    );
  }, [activeQuery, run]);

  if (runsQuery.isPending || runQuery.isPending) {
    return <p className="muted">Loading runs…</p>;
  }

  if (runsQuery.isError || runQuery.isError) {
    return (
      <p role="alert" className="notice notice-error">
        Could not load retrieval runs from {source.name}.
      </p>
    );
  }

  if (!run || !activeQuery) {
    return <p className="muted">This run contains no queries.</p>;
  }

  const relevant = new Set(activeQuery.relevantChunkIds ?? []);

  return (
    <div className="query-screen">
      <div className="controls">
        <label className="field">
          <span>Run</span>
          <select
            value={run.id}
            onChange={(event) =>
              select({ run: event.target.value, chunk: undefined })
            }
          >
            {runs.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {summary.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-grow">
          <span>Query</span>
          <select
            value={activeQuery.query}
            onChange={(event) =>
              select({ query: event.target.value, chunk: undefined })
            }
          >
            {run.queries.map((entry) => (
              <option key={entry.query} value={entry.query}>
                {entry.query}
              </option>
            ))}
          </select>
        </label>
      </div>

      {metrics ? <MetricsPanel summary={metrics} className="metrics" /> : null}

      <div className="panes">
        <ResultList
          queryResult={activeQuery}
          selectedChunkId={activeResult?.chunk.id}
          onSelect={(result) => select({ chunk: result.chunk.id })}
          className="result-list"
        />

        {activeResult ? (
          <ChunkDetail
            result={activeResult}
            explanation={explanationQuery.data ?? null}
            isRelevant={relevant.has(activeResult.chunk.id)}
            className="chunk-detail"
          />
        ) : null}
      </div>
    </div>
  );
}
