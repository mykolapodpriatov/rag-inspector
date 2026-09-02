// Runtime validation for anything crossing into the app.
//
// The fixtures are generated and a live backend is someone else's process; both
// can drift. zod turns "the shape changed" from a mystery `undefined` three
// components deep into an error naming the field, at the boundary where it
// happened.
//
// The schemas mirror `why-this-chunk`'s types.py and `retrieval-diff`'s
// lockfile. Where a name differs it is the transport name being awkward in a
// UI, never a different concept.

import { z } from 'zod';

export const chunkSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  sourceDocumentId: z.string().optional(),
});

export const scoreComponentsSchema = z.object({
  dense: z.number().nullable().optional(),
  lexical: z.number().nullable().optional(),
  alpha: z.number().nullable().optional(),
  denseRaw: z.number().nullable().optional(),
  lexicalRaw: z.number().nullable().optional(),
});

export const scoredChunkSchema = z.object({
  chunk: chunkSchema,
  score: z.number(),
  rank: z.number().int().nonnegative(),
  components: scoreComponentsSchema.optional(),
});

export const queryResultSchema = z.object({
  query: z.string().min(1),
  results: z.array(scoredChunkSchema),
  relevantChunkIds: z.array(z.string()).optional(),
});

export const fingerprintSchema = z.object({
  embeddingModel: z.string(),
  alpha: z.number().nullable(),
  reranker: z.string().nullable(),
  indexContentHash: z.string(),
  digest: z.string(),
  chunkParams: z.record(z.string(), z.unknown()),
});

export const runSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  k: z.number().int().positive(),
  fingerprint: fingerprintSchema,
  queries: z.array(queryResultSchema),
});

export const sentenceAttributionSchema = z.object({
  sentence: z.string(),
  // Character offsets in the chunk text. The attributor returns sentences
  // sorted by descending share; the span is what lets the UI restore reading
  // order, without which the heat map shows a chunk's sentences shuffled.
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  delta: z.number(),
  share: z.number(),
});

export const explanationRecordSchema = z.object({
  runId: z.string().min(1),
  query: z.string().min(1),
  chunkId: z.string().min(1),
  granularity: z.enum(['sentence', 'token']),
  degenerate: z.boolean().optional(),
  sentences: z.array(sentenceAttributionSchema),
  components: z
    .object({
      dense: z.number().nullable().optional(),
      lexical: z.number().nullable().optional(),
      alpha: z.number().nullable().optional(),
      denseContribution: z.number().nullable().optional(),
      lexicalContribution: z.number().nullable().optional(),
      dominant: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const fixtureBundleSchema = z.object({
  runs: z.array(runSchema).min(1),
  explanations: z.array(explanationRecordSchema),
});

export type FixtureBundle = z.infer<typeof fixtureBundleSchema>;
export type ExplanationRecord = z.infer<typeof explanationRecordSchema>;
