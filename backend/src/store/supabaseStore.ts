import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { MatchCard, RunState, RunStore, SearchBrief } from '../types';
import { logger } from '../utils/logger';

const log = logger('supabase-store');

interface RunRow {
  id: string;
  status: RunState['status'];
  brief: SearchBrief;
  cards: MatchCard[];
  stats: RunState['stats'];
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Run store backed by Supabase with an in-memory cache for synchronous reads.
 * Mutations update memory immediately and persist asynchronously.
 */
export class SupabaseRunStore implements RunStore {
  private readonly cache = new Map<string, RunState>();
  private readonly supabase: SupabaseClient;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    void this.hydrate();
  }

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
    this.cache.set(run.id, run);
    void this.persist(run);
    return run;
  }

  get(id: string): RunState | undefined {
    return this.cache.get(id);
  }

  update(id: string, patch: Partial<RunState>): RunState | undefined {
    const run = this.cache.get(id);
    if (!run) return undefined;
    const next: RunState = { ...run, ...patch, id: run.id, updatedAt: new Date().toISOString() };
    this.cache.set(id, next);
    void this.persist(next);
    return next;
  }

  addCard(id: string, card: MatchCard): RunState | undefined {
    const run = this.cache.get(id);
    if (!run) return undefined;
    const next: RunState = {
      ...run,
      cards: [...run.cards, card],
      updatedAt: new Date().toISOString(),
    };
    this.cache.set(id, next);
    void this.persist(next);
    return next;
  }

  private rowFromRun(run: RunState): RunRow {
    return {
      id: run.id,
      status: run.status,
      brief: run.brief,
      cards: run.cards,
      stats: run.stats,
      error: run.error ?? null,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
    };
  }

  private runFromRow(row: RunRow): RunState {
    return {
      id: row.id,
      status: row.status,
      brief: row.brief,
      cards: row.cards ?? [],
      stats: row.stats,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async persist(run: RunState): Promise<void> {
    const { error } = await this.supabase.from('runs').upsert(this.rowFromRun(run), { onConflict: 'id' });
    if (error) log.warn(`persist failed for run ${run.id}: ${error.message}`);
  }

  private async hydrate(): Promise<void> {
    const { data, error } = await this.supabase
      .from('runs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      log.warn(`hydrate failed: ${error.message}`);
      return;
    }

    for (const row of (data ?? []) as RunRow[]) {
      this.cache.set(row.id, this.runFromRow(row));
    }
    log.info(`hydrated ${this.cache.size} runs from Supabase`);
  }
}
