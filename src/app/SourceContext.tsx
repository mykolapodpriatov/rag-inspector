import { createContext, useContext, type ReactNode } from 'react';

import { createFixtureSource } from '../data/fixtureSource';
import type { RetrievalSource } from '../data/source';

// The source is injected rather than imported, so a test can hand a screen a
// two-run stub and the Pages demo can hand it the fixtures without either
// knowing about the other. This is the seam ADR 001 is about, made concrete:
// swapping in a live backend is a provider prop, not a change to any screen.

const SourceContext = createContext<RetrievalSource | null>(null);

export function SourceProvider({
  source,
  children,
}: {
  source?: RetrievalSource;
  children: ReactNode;
}) {
  // Created lazily and once: parsing the fixture bundle is not free, and doing
  // it on every render would show up immediately on the diff screen.
  const value = source ?? defaultSource();
  return (
    <SourceContext.Provider value={value}>{children}</SourceContext.Provider>
  );
}

let cachedDefault: RetrievalSource | null = null;
function defaultSource(): RetrievalSource {
  cachedDefault ??= createFixtureSource();
  return cachedDefault;
}

export function useSource(): RetrievalSource {
  const source = useContext(SourceContext);
  if (!source) {
    throw new Error(
      'useSource was called outside a SourceProvider. Wrap the tree in <SourceProvider> — ' +
        'this usually means a component was rendered directly in a test without it.',
    );
  }
  return source;
}
