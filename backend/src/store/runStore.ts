import { randomUUID } from 'crypto';
import type { RunStore, RunState, SearchBrief, MatchCard } from '../types';

/**
 * In-memory run store. Good enough for the hackathon demo; implements the
 * `RunStore` interface so it can be swapped for Supabase/Redis later without
 * touching the orchestrator or routes.
 */
export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, RunState>();
  /** Soft cap so a long-lived process doesn't grow unbounded. */
  private readonly maxRuns = 500;

  create(brief: SearchBrief): RunState {
    const now = new Date().toISOString();
    const run: RunState = {
      id: randomUUID(),
      status: 'pending',
      brief,
      cards: [],
      stats: { found: 0, researched: 0, dropped: 0 },
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    this.evictIfNeeded();
    return run;
  }

  get(id: string): RunState | undefined {
    return this.runs.get(id);
  }

  update(id: string, patch: Partial<RunState>): RunState | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const next: RunState = { ...run, ...patch, id: run.id, updatedAt: new Date().toISOString() };
    this.runs.set(id, next);
    return next;
  }

  addCard(id: string, card: MatchCard): RunState | undefined {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const next: RunState = {
      ...run,
      cards: [...run.cards, card],
      updatedAt: new Date().toISOString(),
    };
    this.runs.set(id, next);
    return next;
  }

  private evictIfNeeded() {
    if (this.runs.size <= this.maxRuns) return;
    const oldest = this.runs.keys().next().value;
    if (oldest) this.runs.delete(oldest);
  }
}
