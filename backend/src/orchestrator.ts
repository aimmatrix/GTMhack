import { randomUUID } from 'crypto';
import type { Container } from './container';
import { logger } from './utils/logger';
import type {
  SearchBrief,
  RunEvent,
  RunState,
  MatchCard,
  EnrichedCandidate,
  ResearchNotes,
} from './types';

const log = logger('orchestrator');

/** How many candidates we enrich+research at once while streaming. */
const CONCURRENCY = 3;

/**
 * Run the full pipeline for a brief: search → (enrich → research) per match →
 * stream a card as each one is ready. Persists everything to the run store and
 * emits SSE events via `emit`. `isAborted` lets the HTTP layer stop work when
 * the client disconnects.
 */
export async function executeRun(
  container: Container,
  brief: SearchBrief,
  emit: (event: RunEvent) => void,
  isAborted: () => boolean = () => false,
): Promise<RunState> {
  const { store, search, research } = container;
  const run = store.create(brief);
  store.update(run.id, { status: 'running' });
  emit({ type: 'run', runId: run.id, brief });

  try {
    emit({ type: 'status', message: 'Searching for matches…' });
    const candidates = await search.search(brief);
    const slice = candidates.slice(0, brief.max_results);
    store.update(run.id, { stats: { found: candidates.length, researched: 0, dropped: 0 } });
    emit({
      type: 'status',
      message: slice.length
        ? `Found ${candidates.length} candidates — researching the top ${slice.length}…`
        : 'No strong matches found for this brief.',
      found: candidates.length,
    });

    let researched = 0;
    let dropped = 0;

    await mapWithConcurrency(slice, CONCURRENCY, async (candidate) => {
      if (isAborted()) return;
      try {
        const enriched = await search.enrich(candidate, brief);
        const notes = await research.analyze(enriched, brief);
        const card = toCard(enriched, notes);
        store.addCard(run.id, card);
        researched += 1;
        store.update(run.id, { stats: { found: candidates.length, researched, dropped } });
        emit({ type: 'card', card });
        emit({
          type: 'status',
          message: `Researched ${researched}/${slice.length}`,
          researched,
        });
      } catch (err) {
        dropped += 1;
        store.update(run.id, { stats: { found: candidates.length, researched, dropped } });
        log.warn(`dropped a candidate during research: ${candidate.name}`, err);
      }
    });

    const finalRun =
      store.update(run.id, {
        status: 'completed',
        stats: { found: candidates.length, researched, dropped },
      }) ?? run;
    emit({ type: 'done', runId: run.id, stats: finalRun.stats });
    log.info(`run ${run.id} done — found=${candidates.length} researched=${researched} dropped=${dropped}`);
    return finalRun;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Run failed unexpectedly';
    store.update(run.id, { status: 'error', error: message });
    emit({ type: 'error', message });
    log.error(`run ${run.id} failed`, err);
    return store.get(run.id) ?? run;
  }
}

/** Build the streamed match card (PRD research packet) from enrichment + notes. */
function toCard(c: EnrichedCandidate, notes: ResearchNotes): MatchCard {
  const completed: string[] = [];
  if (c.email) completed.push('email');
  if (c.company) completed.push('company');
  if (c.role) completed.push('role');
  if (c.location) completed.push('location');

  const status =
    c.email && (c.company || c.role)
      ? 'ready'
      : completed.length > 0
        ? 'partial'
        : 'unavailable';

  return {
    id: randomUUID(),
    match: {
      name: c.name,
      company: c.company,
      role: c.role,
      location: c.location,
      url: c.url,
      email: c.email,
    },
    why_match: notes.why_match,
    notes: notes.notes,
    suggested_angle: notes.suggested_angle,
    sources: c.sources,
    confidence: notes.confidence,
    lightfern: { completion_status: status, completed_fields: completed },
  };
}

/** Run `worker` over items with bounded concurrency, resolving when all finish. */
async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}
