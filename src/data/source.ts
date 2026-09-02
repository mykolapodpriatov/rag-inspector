// Where retrieval data comes from.
//
// One interface, so a screen never knows whether it is looking at a recorded
// run or a live retriever. That matters for three reasons, in descending order
// of how often they bite:
//
//   1. the demo has to work with no backend, offline, on GitHub Pages;
//   2. the tests must not need a Python process;
//   3. a team pointing this at their own retriever should write an adapter,
//      not a fork.
//
// See docs/decisions/001-adapter-based-sources.md.

import type { Explanation, RetrievalRun } from '../domain/types';

/** A run as it appears in a list — enough to choose one, not the whole payload. */
export interface RunSummary {
  id: string;
  label: string;
  k: number;
  queryCount: number;
  embeddingModel: string;
}

export interface RetrievalSource {
  /** Human-readable name of where this data came from, shown in the UI. */
  readonly name: string;
  listRuns(): Promise<RunSummary[]>;
  getRun(id: string): Promise<RetrievalRun>;
  /**
   * Why a chunk scored what it did.
   *
   * Returns null when the source has no explanation for that pair rather than
   * throwing: not every run is explained, and a missing explanation is a normal
   * state the UI has to render, not an error.
   */
  getExplanation(
    runId: string,
    query: string,
    chunkId: string,
  ): Promise<Explanation | null>;
}

/** Thrown when a source has no run with the requested id. */
export class RunNotFoundError extends Error {
  constructor(public readonly runId: string) {
    super(`No retrieval run with id "${runId}".`);
    this.name = 'RunNotFoundError';
    Object.setPrototypeOf(this, RunNotFoundError.prototype);
  }
}
