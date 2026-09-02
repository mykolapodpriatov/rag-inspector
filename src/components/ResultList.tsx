import type { QueryResult, ScoredChunk } from '../domain/types';
import { ScoreBar } from './ScoreBar';

// The ranked results for one query.
//
// Relevance is marked with a label, not only with a colour — a green tint alone
// is invisible to a colour-blind reader and to anyone printing the page. The
// label also gives the screen reader something to announce.

export interface ResultListProps {
  queryResult: QueryResult;
  selectedChunkId?: string | undefined;
  onSelect: (chunk: ScoredChunk) => void;
  className?: string;
}

export function ResultList({
  queryResult,
  selectedChunkId,
  onSelect,
  className,
}: ResultListProps) {
  const relevant = new Set(queryResult.relevantChunkIds ?? []);
  const maxScore = queryResult.results.reduce(
    (max, result) => Math.max(max, result.score),
    0,
  );

  if (queryResult.results.length === 0) {
    return (
      <p className={className}>
        This query returned nothing. That is itself a finding — the retriever
        had no candidates above its threshold.
      </p>
    );
  }

  return (
    <ol className={className} data-part="results">
      {queryResult.results.map((result) => {
        const isRelevant = relevant.has(result.chunk.id);
        const isSelected = result.chunk.id === selectedChunkId;

        return (
          <li key={result.chunk.id} data-relevant={isRelevant || undefined}>
            <button
              type="button"
              className="result-row"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onSelect(result)}
            >
              <span className="mono result-rank" aria-hidden>
                #{result.rank + 1}
              </span>
              <span className="result-body">
                <span className="result-id">
                  <span className="mono">{result.chunk.id}</span>
                  {isRelevant ? (
                    <span className="badge badge-relevant">relevant</span>
                  ) : null}
                </span>
                <span className="result-text">{result.chunk.text}</span>
              </span>
              <ScoreBar
                score={result.score}
                components={result.components}
                maxScore={maxScore}
                className="result-score"
              />
              {/* The rank is aria-hidden above because "#3" reads as a
                  string of characters; this says it in words. Relevance is
                  not repeated here — the badge is real text and already part
                  of the accessible name. */}
              <span className="sr-only">rank {result.rank + 1}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
