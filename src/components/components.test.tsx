import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '../../test/a11y';
import { summariseMetrics } from '../domain/metrics';
import type { Explanation, QueryResult, ScoredChunk } from '../domain/types';
import { ChunkDetail } from './ChunkDetail';
import { MetricsPanel } from './MetricsPanel';
import { ResultList } from './ResultList';
import { ScoreBar } from './ScoreBar';

const result: ScoredChunk = {
  chunk: { id: 'seine', text: 'The Seine is a river. It flows through Paris.' },
  score: 0.812,
  rank: 0,
  components: { dense: 0.9, lexical: 0.5, alpha: 0.5 },
};

const queryResult: QueryResult = {
  query: 'France river Paris',
  relevantChunkIds: ['eiffel'],
  results: [
    result,
    {
      chunk: { id: 'eiffel', text: 'The Eiffel Tower is in Paris.' },
      score: 0.4,
      rank: 1,
    },
  ],
};

// Sentences arrive ordered by descending share, which is how the attributor
// returns them and the opposite of reading order.
const explanation: Explanation = {
  query: 'France river Paris',
  chunkId: 'seine',
  granularity: 'sentence',
  sentences: [
    {
      sentence: 'It flows through Paris.',
      start: 22,
      end: 45,
      delta: 0.4,
      share: 0.8,
    },
    {
      sentence: 'The Seine is a river.',
      start: 0,
      end: 21,
      delta: 0.1,
      share: 0.2,
    },
  ],
};

describe('<ScoreBar />', () => {
  it('shows contributions, not raw modality scores', () => {
    // dense 0.9 at alpha 0.5 contributes 0.45, not 0.9. Showing 0.9 would tell
    // the reader the dense side dominated when it contributed less than half.
    render(<ScoreBar score={0.7} components={result.components} />);

    const bar = screen.getByRole('img');
    expect(bar).toHaveAccessibleName(/dense 0\.450/);
    expect(bar).toHaveAccessibleName(/lexical 0\.250/);
  });

  it('describes the score in text, since a bar means nothing to a screen reader', () => {
    render(<ScoreBar score={0.812} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('score 0.812');
  });

  it('renders a single segment when the retriever reports no split', () => {
    const { container } = render(<ScoreBar score={0.5} />);

    expect(
      container.querySelector('[data-part="segment-total"]'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-part="segment-dense"]')).toBeNull();
  });

  it('omits the split when only part of it is reported', () => {
    // dense without alpha cannot be turned into a contribution, and guessing
    // alpha would invent a number the retriever never produced.
    const { container } = render(
      <ScoreBar score={0.5} components={{ dense: 0.9 }} />,
    );

    expect(
      container.querySelector('[data-part="segment-total"]'),
    ).toBeInTheDocument();
  });
});

describe('<MetricsPanel />', () => {
  it('shows an em dash, never 0.00, for an unlabelled query', () => {
    render(<MetricsPanel summary={summariseMetrics(['a'], undefined, 3)} />);

    expect(screen.queryByText('0.000')).not.toBeInTheDocument();
    expect(screen.getAllByTitle('No ground truth').length).toBeGreaterThan(0);
  });

  it('explains the em dash to a screen reader', () => {
    render(<MetricsPanel summary={summariseMetrics(['a'], undefined, 3)} />);

    expect(
      screen.getAllByText('not defined, no ground truth').length,
    ).toBeGreaterThan(0);
  });

  it('renders the computed values for a labelled query', () => {
    render(<MetricsPanel summary={summariseMetrics(['a', 'b'], ['a'], 2)} />);

    // precision 1/2, recall 1/1, MRR 1/1
    expect(screen.getByText('0.500')).toBeInTheDocument();
    expect(screen.getAllByText('1.000').length).toBeGreaterThan(0);
  });

  it('shows a signed delta against a comparison run', () => {
    render(
      <MetricsPanel
        summary={summariseMetrics(['a', 'b'], ['a'], 2)}
        compareTo={summariseMetrics(['b', 'a'], ['a'], 2)}
      />,
    );

    expect(screen.getByText('+0.500')).toBeInTheDocument();
  });
});

describe('<ResultList />', () => {
  it('lists results in rank order', () => {
    render(<ResultList queryResult={queryResult} onSelect={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(
      within(items[0] as HTMLElement).getByText('seine'),
    ).toBeInTheDocument();
  });

  it('labels a relevant chunk in text, not only in colour', () => {
    render(<ResultList queryResult={queryResult} onSelect={vi.fn()} />);

    const eiffel = screen
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText('eiffel'));
    expect(
      within(eiffel as HTMLElement).getByText('relevant'),
    ).toBeInTheDocument();
  });

  it('reports the selected row with aria-current', () => {
    render(
      <ResultList
        queryResult={queryResult}
        selectedChunkId="eiffel"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { current: true })).toHaveTextContent(
      'eiffel',
    );
  });

  it('calls back with the clicked result', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ResultList queryResult={queryResult} onSelect={onSelect} />);

    await user.click(screen.getAllByRole('button')[1] as HTMLElement);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        chunk: expect.objectContaining({ id: 'eiffel' }),
      }),
    );
  });

  it('says something useful when a query returned nothing', () => {
    render(
      <ResultList
        queryResult={{ ...queryResult, results: [] }}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText(/returned nothing/i)).toBeInTheDocument();
  });
});

describe('<ChunkDetail />', () => {
  it('renders the chunk text in reading order, not attribution order', () => {
    // The attributor sorts by descending share. Rendering the heat map in that
    // order shuffles the passage and shows the reader text that does not exist.
    const { container } = render(
      <ChunkDetail
        result={result}
        explanation={explanation}
        isRelevant={false}
      />,
    );

    const text = container.querySelector('[data-part="attributed-text"]');
    expect(text?.textContent?.trim()).toBe(
      'The Seine is a river. It flows through Paris.',
    );
  });

  it('keeps the table in attribution order, strongest first', () => {
    render(
      <ChunkDetail
        result={result}
        explanation={explanation}
        isRelevant={false}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('It flows through Paris.');
    expect(rows[0]).toHaveTextContent('80.0%');
  });

  it('says so when no explanation was recorded', () => {
    render(
      <ChunkDetail result={result} explanation={null} isRelevant={false} />,
    );

    expect(
      screen.getByText(/No explanation was recorded/i),
    ).toBeInTheDocument();
  });

  it('warns when the attribution is a degenerate even split', () => {
    // An even split means the attributor found nothing, not that every sentence
    // mattered equally. Rendering it as a flat heat map would look like signal.
    render(
      <ChunkDetail
        result={result}
        explanation={{
          ...explanation,
          sentences: explanation.sentences.map((sentence) => ({
            ...sentence,
            share: 0.5,
          })),
        }}
        isRelevant={false}
      />,
    );

    expect(screen.getByText(/carries no signal/i)).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('the result list has no violations', async () => {
    const { container } = render(
      <ResultList queryResult={queryResult} onSelect={vi.fn()} />,
    );

    await expectNoA11yViolations(container);
  });

  it('the metrics panel has no violations, labelled or not', async () => {
    const { container } = render(
      <>
        <MetricsPanel summary={summariseMetrics(['a'], ['a'], 3)} />
        <MetricsPanel summary={summariseMetrics(['a'], undefined, 3)} />
      </>,
    );

    await expectNoA11yViolations(container);
  });

  it('the chunk detail has no violations', async () => {
    const { container } = render(
      <ChunkDetail result={result} explanation={explanation} isRelevant />,
    );

    await expectNoA11yViolations(container);
  });
});
