import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { SourceProvider } from './app/SourceContext';
import { createAppRouter } from './app/router';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root — index.html is out of sync.');

// The data never changes at runtime — it is a recorded run — so refetching on
// window focus would be pure churn.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: 1 },
  },
});

const router = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SourceProvider>
        <RouterProvider router={router} />
      </SourceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
