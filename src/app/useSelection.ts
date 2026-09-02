import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback } from 'react';

import type { QuerySearch } from './router';

// Reading and writing the selection that lives in the URL.
//
// `replace: true` on every change is deliberate: choosing a different chunk is
// browsing, not navigating, and pushing a history entry per click means the
// back button walks through twenty chunk selections instead of leaving the
// screen. The URL still updates, so the link is still shareable — which is the
// property that actually matters.

export interface Selection {
  runId: string | undefined;
  query: string | undefined;
  chunkId: string | undefined;
  select: (next: Partial<QuerySearch>) => void;
}

export function useSelection(): Selection {
  const search = useSearch({ strict: false }) as QuerySearch;
  const navigate = useNavigate();

  const select = useCallback(
    (next: Partial<QuerySearch>) => {
      void navigate({
        to: '.',
        search: (previous: QuerySearch) => {
          const merged = { ...previous, ...next };
          // Drop empty keys rather than carrying `?chunk=` around: a URL that
          // is shared should contain the selection and nothing else.
          return Object.fromEntries(
            Object.entries(merged).filter(([, value]) => Boolean(value)),
          );
        },
        replace: true,
      });
    },
    [navigate],
  );

  return {
    runId: search.run,
    query: search.query,
    chunkId: search.chunk,
    select,
  };
}
