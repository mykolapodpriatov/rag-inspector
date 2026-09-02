import type { MetricSummary } from '../domain/metrics';

// The metrics row.
//
// The important behaviour here is what it does with `null`: it prints an em
// dash and says why, rather than 0.00. A dashboard that shows 0.00 for an
// unlabelled query will be believed, and the reader will conclude the retriever
// failed when in fact nobody has said what success would be. That distinction
// is the whole reason the metric functions return null in the first place, and
// it would be undone by a single `?? 0` here.

export interface MetricsPanelProps {
  summary: MetricSummary;
  /** Optional comparison, e.g. the baseline when viewing a candidate. */
  compareTo?: MetricSummary | undefined;
  className?: string;
}

interface Metric {
  key: keyof MetricSummary;
  label: string;
  hint: string;
}

const METRICS: Metric[] = [
  {
    key: 'precisionAtK',
    label: 'Precision@K',
    hint: 'Share of the returned context that was relevant.',
  },
  {
    key: 'recallAtK',
    label: 'Recall@K',
    hint: 'Share of the known-relevant chunks that were returned.',
  },
  {
    key: 'reciprocalRank',
    label: 'MRR',
    hint: 'One over the position of the first relevant chunk.',
  },
  {
    key: 'ndcgAtK',
    label: 'nDCG@K',
    hint: 'Ranking quality, discounted by position.',
  },
];

function formatDelta(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return '';
  const delta = current - previous;
  if (Math.abs(delta) < 0.0005) return '±0.000';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}`;
}

export function MetricsPanel({
  summary,
  compareTo,
  className,
}: MetricsPanelProps) {
  return (
    <dl className={className} data-part="metrics">
      {METRICS.map((metric) => {
        const value = summary[metric.key] as number | null;
        const previous = (compareTo?.[metric.key] ?? null) as number | null;
        const delta = compareTo ? formatDelta(value, previous) : '';
        const direction = delta.startsWith('+')
          ? 'up'
          : delta.startsWith('−')
            ? 'down'
            : 'flat';

        return (
          <div key={metric.key} className="metric" data-metric={metric.key}>
            <dt title={metric.hint}>{metric.label}</dt>
            <dd>
              {value === null ? (
                <span className="metric-undefined" title="No ground truth">
                  {/* An em dash, not 0.00: undefined is not zero. */}
                  <span aria-hidden>—</span>
                  <span className="sr-only">not defined, no ground truth</span>
                </span>
              ) : (
                <span className="mono">{value.toFixed(3)}</span>
              )}
              {delta ? (
                <span className="metric-delta" data-direction={direction}>
                  {delta}
                </span>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
