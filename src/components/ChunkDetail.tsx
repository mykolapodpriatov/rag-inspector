import type { Explanation, ScoredChunk } from '../domain/types';

// Why this chunk scored what it did.
//
// The sentence attribution comes from occlusion: each sentence is removed and
// the chunk re-scored, so `share` is the fraction of the score that sentence
// was responsible for. Rendering it as a heat map over the actual text is the
// point of the screen — "this chunk matched because of *that* sentence" is a
// far more actionable finding than a number.
//
// Two details that matter for honesty:
//
//   - the shading uses opacity over a single hue, so the ordering survives
//     greyscale printing and colour blindness;
//   - a degenerate attribution (no sentence had positive impact, so the tool
//     fell back to a uniform 1/n) is labelled as such rather than rendered as
//     a flat heat map that looks like a real result.

export interface ChunkDetailProps {
  result: ScoredChunk;
  explanation: Explanation | null;
  isRelevant: boolean;
  className?: string;
}

/** Opacity for a share, floored so the least-important sentence stays legible. */
function shadeFor(share: number): number {
  return Math.min(0.45, Math.max(0.04, share * 0.45));
}

export function ChunkDetail({
  result,
  explanation,
  isRelevant,
  className,
}: ChunkDetailProps) {
  const sentences = explanation?.sentences ?? [];

  // The attributor returns sentences ordered by descending share, which is the
  // right order for the table and the wrong order for the text: rendering them
  // that way shuffles the chunk and shows the reader a passage that does not
  // exist. The heat map is sorted back into reading order by span.
  const inReadingOrder = [...sentences].sort((a, b) => a.start - b.start);

  const firstShare = sentences[0]?.share;
  const degenerate =
    sentences.length > 1 &&
    firstShare !== undefined &&
    sentences.every((sentence) => Math.abs(sentence.share - firstShare) < 1e-9);

  return (
    <section className={className} aria-label="Chunk detail">
      <header className="chunk-header">
        <h2>
          <span className="mono">{result.chunk.id}</span>
          {isRelevant ? (
            <span className="badge badge-relevant">relevant</span>
          ) : null}
        </h2>
        <dl className="chunk-facts">
          <div>
            <dt>Rank</dt>
            <dd className="mono">#{result.rank + 1}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd className="mono">{result.score.toFixed(4)}</dd>
          </div>
          {result.components?.alpha != null ? (
            <div>
              <dt>Alpha</dt>
              <dd className="mono">{result.components.alpha.toFixed(2)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      {explanation === null ? (
        <p className="muted">
          No explanation was recorded for this chunk and query. The run stores
          attributions for its top results only.
        </p>
      ) : (
        <>
          {degenerate ? (
            <p className="notice">
              Every sentence scored the same. The attributor found no sentence
              with positive impact and fell back to an even split, so the
              shading below carries no signal.
            </p>
          ) : null}

          <p className="chunk-text" data-part="attributed-text">
            {inReadingOrder.map((sentence, index) => (
              <span
                key={`${index}-${sentence.sentence.slice(0, 12)}`}
                className="sentence"
                style={{
                  backgroundColor: `color-mix(in oklab, var(--accent) ${
                    shadeFor(sentence.share) * 100
                  }%, transparent)`,
                }}
                title={`share ${(sentence.share * 100).toFixed(1)}% · delta ${sentence.delta.toFixed(4)}`}
              >
                {sentence.sentence}{' '}
              </span>
            ))}
          </p>

          <table className="attribution-table">
            <caption>
              Sentence attribution — the share of the score each sentence was
              responsible for, measured by removing it and re-scoring.
            </caption>
            <thead>
              <tr>
                <th scope="col">Sentence</th>
                <th scope="col">Share</th>
                <th scope="col">Delta</th>
              </tr>
            </thead>
            <tbody>
              {sentences.map((sentence, index) => (
                <tr key={`${index}-row`}>
                  <td>{sentence.sentence}</td>
                  <td className="mono">{(sentence.share * 100).toFixed(1)}%</td>
                  <td className="mono">{sentence.delta.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
