import type { ScoreComponents } from '../domain/types';

// How a hybrid score was assembled, as a stacked bar.
//
// The bar shows *contributions*, not raw modality scores: a dense score of 0.9
// at alpha 0.2 contributes 0.18, and showing 0.9 would tell the reader the
// dense side dominated when it did not. The contribution is what actually
// decided the ranking, so that is what gets the pixels.
//
// A retriever with no split reports nothing rather than a full-width bar of one
// colour — absent and "100% dense" are different facts.

export interface ScoreBarProps {
  score: number;
  components?: ScoreComponents | undefined;
  /** The largest score in the list, so bars are comparable across rows. */
  maxScore?: number;
  className?: string;
}

interface Contribution {
  label: string;
  value: number;
  color: string;
}

function contributionsOf(
  components: ScoreComponents | undefined,
): Contribution[] | null {
  if (!components) return null;

  const { dense, lexical, alpha } = components;
  if (dense == null || lexical == null || alpha == null) return null;

  return [
    { label: 'dense', value: alpha * dense, color: 'var(--dense)' },
    { label: 'lexical', value: (1 - alpha) * lexical, color: 'var(--lexical)' },
  ];
}

export function ScoreBar({
  score,
  components,
  maxScore = 1,
  className,
}: ScoreBarProps) {
  const scale = maxScore > 0 ? maxScore : 1;
  const contributions = contributionsOf(components);

  // The accessible name carries the same information as the colours, because a
  // stacked bar is meaningless to a screen reader and colour alone is
  // meaningless to a third of colour-blind readers.
  const label = contributions
    ? `score ${score.toFixed(3)}: ` +
      contributions
        .map((part) => `${part.label} ${part.value.toFixed(3)}`)
        .join(', ')
    : `score ${score.toFixed(3)}`;

  return (
    <div className={className} data-part="score-bar">
      <div
        className="score-bar-track"
        role="img"
        aria-label={label}
        title={label}
      >
        {contributions ? (
          contributions.map((part) => (
            <span
              key={part.label}
              className="score-bar-segment"
              data-part={`segment-${part.label}`}
              style={{
                width: `${Math.max(0, (part.value / scale) * 100)}%`,
                background: part.color,
              }}
            />
          ))
        ) : (
          <span
            className="score-bar-segment"
            data-part="segment-total"
            style={{
              width: `${Math.max(0, (score / scale) * 100)}%`,
              background: 'var(--accent)',
            }}
          />
        )}
      </div>
      <span className="mono score-bar-value">{score.toFixed(3)}</span>
    </div>
  );
}
