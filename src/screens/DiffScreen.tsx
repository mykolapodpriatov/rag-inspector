import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';

import { useSource } from '../app/SourceContext';
import type { DiffSearch } from '../app/router';
import { MetricsPanel } from '../components/MetricsPanel';
import { diffRankings, rankChurn } from '../domain/diff';
import { summariseMetrics } from '../domain/metrics';

// Two runs, side by side, for one query.
//
// The table is the point: a retriever change should read like a diff, so the
// question "did the model bump break anything?" has an answer you can point at
// rather than two lists to eyeball.

const CHANGE_LABEL: Record<string, string> = {
  added: 'added',
  removed: 'dropped',
  moved: 'moved',
  rescored: 'rescored',
  unchanged: 'unchanged',
};

function RankCell({ value }: { value: number | null }) {
  return <td className="mono">{value === null ? '—' : `#${value + 1}`}</td>;
}

export function DiffScreen() {
  const source = useSource();
  const search = useSearch({ strict: false }) as DiffSearch;
  const navigate = useNavigate();

  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => source.listRuns(),
  });
  const runs = runsQuery.data ?? [];

  const baseId = search.base ?? runs[0]?.id;
  const candidateId = search.candidate ?? runs[1]?.id ?? runs[0]?.id;

  const baseQuery = useQuery({
    queryKey: ['run', baseId],
    queryFn: () => source.getRun(baseId as string),
    enabled: Boolean(baseId),
  });
  const candidateQuery = useQuery({
    queryKey: ['run', candidateId],
    queryFn: () => source.getRun(candidateId as string),
    enabled: Boolean(candidateId),
  });

  const base = baseQuery.data;
  const candidate = candidateQuery.data;

  const activeQueryText =
    base?.queries.find((entry) => entry.query === search.query)?.query ??
    base?.queries[0]?.query;

  const comparison = useMemo(() => {
    if (!base || !candidate || !activeQueryText) return null;

    const baseEntry = base.queries.find((e) => e.query === activeQueryText);
    const candidateEntry = candidate.queries.find(
      (e) => e.query === activeQueryText,
    );
    if (!baseEntry || !candidateEntry) return null;

    const toEntries = (results: typeof baseEntry.results) =>
      results.map((result) => ({
        id: result.chunk.id,
        rank: result.rank,
        score: result.score,
      }));

    const baseIds = baseEntry.results.map((r) => r.chunk.id);
    const candidateIds = candidateEntry.results.map((r) => r.chunk.id);

    return {
      rows: diffRankings(
        toEntries(baseEntry.results),
        toEntries(candidateEntry.results),
      ),
      churn: rankChurn(baseIds, candidateIds),
      baseMetrics: summariseMetrics(
        baseIds,
        baseEntry.relevantChunkIds,
        base.k,
      ),
      candidateMetrics: summariseMetrics(
        candidateIds,
        candidateEntry.relevantChunkIds,
        candidate.k,
      ),
    };
  }, [base, candidate, activeQueryText]);

  if (runsQuery.isPending || baseQuery.isPending || candidateQuery.isPending) {
    return <p className="muted">Loading runs…</p>;
  }

  if (!base || !candidate || !comparison || !activeQueryText) {
    return <p className="muted">Two runs are needed to show a diff.</p>;
  }

  const update = (next: Partial<DiffSearch>) =>
    void navigate({
      to: '/diff',
      search: (previous: DiffSearch) => ({ ...previous, ...next }),
      replace: true,
    });

  return (
    <div className="diff-screen">
      <div className="controls">
        <div className="field">
          <label htmlFor="baseline-select">Baseline</label>
          <select
            id="baseline-select"
            value={base.id}
            onChange={(event) => update({ base: event.target.value })}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="candidate-select">Candidate</label>
          <select
            id="candidate-select"
            value={candidate.id}
            onChange={(event) => update({ candidate: event.target.value })}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field field-grow">
          <label htmlFor="diff-query-select">Query</label>
          <select
            id="diff-query-select"
            value={activeQueryText}
            onChange={(event) => update({ query: event.target.value })}
          >
            {base.queries.map((entry) => (
              <option key={entry.query} value={entry.query}>
                {entry.query}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="diff-metrics">
        <section>
          <h2>Baseline</h2>
          <MetricsPanel summary={comparison.baseMetrics} className="metrics" />
        </section>
        <section>
          <h2>Candidate</h2>
          <MetricsPanel
            summary={comparison.candidateMetrics}
            compareTo={comparison.baseMetrics}
            className="metrics"
          />
        </section>
      </div>

      <p className="churn">
        Rank churn <span className="mono">{comparison.churn.toFixed(3)}</span>
        <span className="muted">
          {' '}
          — 0 means the two rankings are identical, 1 means nothing survived.
        </span>
      </p>

      <table className="diff-table">
        <caption>
          Ordered by the candidate ranking; chunks the candidate dropped are
          listed last.
        </caption>
        <thead>
          <tr>
            <th scope="col">Chunk</th>
            <th scope="col">Change</th>
            <th scope="col">Baseline</th>
            <th scope="col">Candidate</th>
            <th scope="col">Δ rank</th>
            <th scope="col">Δ score</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr key={row.id} data-change={row.change}>
              <td className="mono">{row.id}</td>
              <td>
                {/* A symbol and a word: the arrow is quick to scan, the word
                    survives greyscale and screen readers. */}
                <span className="change" data-change={row.change}>
                  <span aria-hidden>
                    {row.change === 'added'
                      ? '+'
                      : row.change === 'removed'
                        ? '−'
                        : row.rankDelta && row.rankDelta < 0
                          ? '↑'
                          : row.rankDelta && row.rankDelta > 0
                            ? '↓'
                            : '='}
                  </span>{' '}
                  {CHANGE_LABEL[row.change]}
                </span>
              </td>
              <RankCell value={row.baseRank} />
              <RankCell value={row.candidateRank} />
              <td className="mono">
                {row.rankDelta === null
                  ? '—'
                  : row.rankDelta === 0
                    ? '0'
                    : `${row.rankDelta > 0 ? '+' : '−'}${Math.abs(row.rankDelta)}`}
              </td>
              <td className="mono">
                {/* A sign on an unchanged score reads as a change that
                    rounded away; a bare 0.000 says nothing moved. */}
                {row.scoreDelta === null
                  ? '—'
                  : Math.abs(row.scoreDelta) < 0.0005
                    ? '0.000'
                    : `${row.scoreDelta > 0 ? '+' : '−'}${Math.abs(row.scoreDelta).toFixed(3)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
