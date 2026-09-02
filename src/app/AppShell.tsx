import { Link, Outlet } from '@tanstack/react-router';

import { useSource } from './SourceContext';

export function AppShell() {
  const source = useSource();

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <strong>rag-inspector</strong>
          <span className="muted"> — why this chunk?</span>
        </div>

        <nav aria-label="Views">
          <Link to="/" activeProps={{ 'aria-current': 'page' }}>
            Query
          </Link>
          <Link to="/diff" activeProps={{ 'aria-current': 'page' }}>
            Diff
          </Link>
        </nav>

        {/* Saying where the data came from is not decoration: a demo that looks
            like a live tool and is not one misleads, and a live tool that looks
            like a demo gets distrusted. */}
        <span className="source-badge" title="Where this data comes from">
          {source.name}
        </span>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
