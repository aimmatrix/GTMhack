/**
 * Tiny typed HTTP client for the Lightfern Reach backend.
 * Import from the frontend: `import { createClient } from '../backend/client/lightfernClient'`
 */
import type {
  ConversationInput,
  HandoffRequest,
  HandoffResult,
  MatchCard,
  RunEvent,
  RunState,
  SearchBrief,
} from '../src/types';

export type {
  ConversationInput,
  HandoffRequest,
  HandoffResult,
  MatchCard,
  RunEvent,
  RunState,
  SearchBrief,
};

export interface LightfernClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface StreamRunHandlers {
  onRun?: (runId: string, brief: SearchBrief) => void;
  onStatus?: (message: string, found?: number, researched?: number) => void;
  onCard?: (card: MatchCard) => void;
  onDone?: (runId: string, stats: { found: number; researched: number; dropped: number }) => void;
  onError?: (message: string) => void;
}

export interface StreamRunResult {
  runId: string;
  stats: { found: number; researched: number; dropped: number };
  cards: MatchCard[];
}

export function createClient(options: LightfernClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? 'http://localhost:8787').replace(/\/$/, '');
  const fetchFn = options.fetchFn ?? fetch;

  async function buildBrief(input: ConversationInput): Promise<SearchBrief> {
    const res = await fetchFn(`${baseUrl}/api/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `brief failed (${res.status})`);
    }
    const body = (await res.json()) as { brief: SearchBrief };
    return body.brief;
  }

  async function streamRun(
    payload: { brief: SearchBrief } | { input: ConversationInput },
    handlers: StreamRunHandlers = {},
  ): Promise<StreamRunResult> {
    const res = await fetchFn(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `run failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let runId = '';
    let stats = { found: 0, researched: 0, dropped: 0 };
    const cards: MatchCard[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;

        const evt = JSON.parse(dataLine.slice(6)) as RunEvent;
        switch (evt.type) {
          case 'run':
            runId = evt.runId;
            handlers.onRun?.(evt.runId, evt.brief);
            break;
          case 'status':
            handlers.onStatus?.(evt.message, evt.found, evt.researched);
            break;
          case 'card':
            cards.push(evt.card);
            handlers.onCard?.(evt.card);
            break;
          case 'done':
            stats = evt.stats;
            handlers.onDone?.(evt.runId, evt.stats);
            break;
          case 'error':
            handlers.onError?.(evt.message);
            throw new Error(evt.message);
        }
      }
    }

    if (!runId) throw new Error('stream ended without run event');
    return { runId, stats, cards };
  }

  async function getRun(id: string): Promise<RunState> {
    const res = await fetchFn(`${baseUrl}/api/run/${id}`);
    if (res.status === 404) throw new Error('run not found');
    if (!res.ok) throw new Error(`getRun failed (${res.status})`);
    const body = (await res.json()) as { run: RunState };
    return body.run;
  }

  async function handoff(req: HandoffRequest): Promise<HandoffResult> {
    const res = await fetchFn(`${baseUrl}/api/lightfern/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `handoff failed (${res.status})`);
    }
    const body = (await res.json()) as { result: HandoffResult };
    return body.result;
  }

  async function health(): Promise<unknown> {
    const res = await fetchFn(`${baseUrl}/api/health`);
    if (!res.ok) throw new Error(`health failed (${res.status})`);
    return res.json();
  }

  return { buildBrief, streamRun, getRun, handoff, health, baseUrl };
}

/** Default singleton for quick imports. */
export const lightfern = createClient();
