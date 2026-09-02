import {
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router';
import { z } from 'zod';

import { AppShell } from './AppShell';
import { DiffScreen } from '../screens/DiffScreen';
import { QueryScreen } from '../screens/QueryScreen';

// Routing is search-param-shaped rather than path-shaped, because the state
// that matters is a *selection* — which run, which query, which chunk — not a
// hierarchy of pages. Putting it in the URL is what makes a finding shareable:
// "look at this chunk, in this run, for this query" is a link, not a screen
// recording and a paragraph of instructions.
//
// The schemas are the parser: an old link with a query that no longer exists
// falls back to the first one rather than rendering an empty screen.

const querySearchSchema = z.object({
  run: z.string().optional(),
  query: z.string().optional(),
  chunk: z.string().optional(),
});

const diffSearchSchema = z.object({
  base: z.string().optional(),
  candidate: z.string().optional(),
  query: z.string().optional(),
});

export type QuerySearch = z.infer<typeof querySearchSchema>;
export type DiffSearch = z.infer<typeof diffSearchSchema>;

const rootRoute = createRootRoute({ component: AppShell });

const queryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: querySearchSchema,
  component: QueryScreen,
});

const diffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/diff',
  validateSearch: diffSearchSchema,
  component: DiffScreen,
});

const routeTree = rootRoute.addChildren([queryRoute, diffRoute]);

export function createAppRouter(): AnyRouter {
  return createRouter({
    routeTree,
    // GitHub Pages serves the app from /<repo>/; Vite hands us the same base it
    // built the assets with, so the two can never disagree.
    basepath: import.meta.env.BASE_URL,
    defaultPreload: 'intent',
  });
}

export { queryRoute, diffRoute };
