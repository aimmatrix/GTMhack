import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { container } from '../container';
import { executeRun } from '../orchestrator';
import { SSEStream } from '../utils/sse';
import { config } from '../config';
import type { SearchBrief, ConversationInput } from '../types';

const TARGET_TYPE_VALUES = ['customers', 'investors', 'startups', 'local_businesses'] as const;

/** Permissive schema for a brief the client echoes back (possibly edited). */
const briefSchema = z.object({
  id: z.string().optional(),
  targetType: z.enum(TARGET_TYPE_VALUES),
  entity: z.enum(['people', 'businesses']),
  looking_for: z.string(),
  location: z.string().optional(),
  interest: z.string().optional(),
  goal: z.string().optional(),
  filters: z.record(z.any()).default({}),
  max_results: z.number().int().positive().max(50).optional(),
  raw: z.any().optional(),
  needs_clarification: z.array(z.any()).optional(),
});

const runBodySchema = z.union([
  z.object({ brief: briefSchema }),
  z.object({
    input: z.object({
      description: z.string().min(1),
      targetType: z.enum(TARGET_TYPE_VALUES).optional(),
      goal: z.string().optional(),
      location: z.string().optional(),
    }),
  }),
]);

/**
 * POST /api/run  (Server-Sent Events stream)
 *   Body: { brief: SearchBrief }  OR  { input: ConversationInput }
 *   Streams events: `run`, `status`, `card`(×N), `done` | `error`.
 *
 * GET /api/run/:id
 *   Returns the persisted run state (poll/fallback for non-SSE clients).
 */
export async function runRoutes(app: FastifyInstance) {
  app.post('/api/run', async (req, reply) => {
    const parsed = runBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }

    let brief: SearchBrief;
    if ('brief' in parsed.data) {
      brief = normalizeBrief(parsed.data.brief);
    } else {
      brief = await container.brief.build(parsed.data.input as ConversationInput);
    }

    // Take over the socket and stream SSE.
    reply.hijack();
    const sse = new SSEStream(reply);
    const heartbeat = setInterval(() => sse.ping(), 15000);
    let aborted = false;
    // Detect a genuine client disconnect on the RESPONSE socket. (Listening on
    // req.raw's 'close' fires the instant Fastify finishes reading the POST
    // body, which would falsely abort every run before any card is processed.)
    reply.raw.on('close', () => {
      if (!sse.isClosed) aborted = true;
    });

    try {
      await executeRun(container, brief, (event) => sse.send(event), () => aborted);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Run failed';
      sse.send({ type: 'error', message });
    } finally {
      clearInterval(heartbeat);
      sse.close();
    }
  });

  app.get('/api/run/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const run = container.store.get(id);
    if (!run) return reply.code(404).send({ error: 'not_found' });
    return { run };
  });
}

/** Fill any missing fields on a client-supplied brief with safe defaults. */
function normalizeBrief(b: z.infer<typeof briefSchema>): SearchBrief {
  const raw: ConversationInput =
    b.raw && typeof b.raw === 'object' && 'description' in b.raw
      ? (b.raw as ConversationInput)
      : { description: b.looking_for, targetType: b.targetType, goal: b.goal, location: b.location };

  return {
    id: b.id ?? randomUUID(),
    targetType: b.targetType,
    entity: b.entity,
    looking_for: b.looking_for,
    location: b.location,
    interest: b.interest,
    goal: b.goal,
    filters: (b.filters ?? {}) as SearchBrief['filters'],
    max_results: b.max_results ?? config.maxResults,
    raw,
    needs_clarification: b.needs_clarification as SearchBrief['needs_clarification'],
  };
}
