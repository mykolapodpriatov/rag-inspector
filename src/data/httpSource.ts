// A source backed by a live retriever behind an HTTP API.
//
// Same interface as the fixtures, so no screen changes when you point this at a
// real index. The contract is deliberately small — three endpoints — because
// the smaller it is, the more likely a team wires their own retriever to it
// rather than forking the app:
//
//   GET /runs                                     -> RunSummary[]
//   GET /runs/:id                                 -> RetrievalRun
//   GET /runs/:id/explanation?query=&chunkId=     -> Explanation | 404
//
// A reference FastAPI adapter is in docs/http-adapter.md.

import type { Explanation, RetrievalRun } from '../domain/types';
import {
  explanationRecordSchema,
  runSchema,
  type ExplanationRecord,
} from './schema';
import {
  RunNotFoundError,
  type RetrievalSource,
  type RunSummary,
} from './source';
import { z } from 'zod';

const runSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  k: z.number().int().positive(),
  queryCount: z.number().int().nonnegative(),
  embeddingModel: z.string(),
});

export interface HttpSourceOptions {
  baseUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Extra headers, e.g. an auth token for a private deployment. */
  headers?: Readonly<Record<string, string>>;
}

/** Thrown when the backend answers, but not in a shape this app can render. */
export class SchemaDriftError extends Error {
  constructor(
    public readonly url: string,
    public readonly issues: unknown,
  ) {
    super(
      `The backend response for ${url} did not match the expected shape. ` +
        `This usually means the API moved ahead of the UI.`,
    );
    this.name = 'SchemaDriftError';
    Object.setPrototypeOf(this, SchemaDriftError.prototype);
  }
}

export function createHttpSource(options: HttpSourceOptions): RetrievalSource {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch;

  async function get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const url = `${baseUrl}${path}`;
    const response = await doFetch(url, {
      headers: { Accept: 'application/json', ...options.headers },
    });

    // 404 is a normal answer for "no explanation for this pair", so it is the
    // caller's decision what to do with it, not an exception.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `The backend returned ${response.status} ${response.statusText} for ${url}.`,
      );
    }

    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new SchemaDriftError(url, parsed.error.issues);
    return parsed.data;
  }

  function toExplanation(record: ExplanationRecord): Explanation {
    const components = record.components;
    return {
      query: record.query,
      chunkId: record.chunkId,
      granularity: record.granularity,
      sentences: record.sentences,
      ...(components
        ? {
            components: {
              ...(components.dense != null ? { dense: components.dense } : {}),
              ...(components.lexical != null
                ? { lexical: components.lexical }
                : {}),
              ...(components.alpha != null ? { alpha: components.alpha } : {}),
            },
          }
        : {}),
    };
  }

  return {
    name: `Live backend (${baseUrl})`,

    async listRuns(): Promise<RunSummary[]> {
      const runs = await get('/runs', z.array(runSummarySchema));
      return runs ?? [];
    },

    async getRun(id: string): Promise<RetrievalRun> {
      const run = await get(`/runs/${encodeURIComponent(id)}`, runSchema);
      if (!run) throw new RunNotFoundError(id);
      return run as RetrievalRun;
    },

    async getExplanation(
      runId: string,
      query: string,
      chunkId: string,
    ): Promise<Explanation | null> {
      const search = new URLSearchParams({ query, chunkId });
      const record = await get(
        `/runs/${encodeURIComponent(runId)}/explanation?${search.toString()}`,
        explanationRecordSchema,
      );
      return record ? toExplanation(record) : null;
    },
  };
}
