import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { container } from '../container';

const inputSchema = z.object({
  description: z.string().min(1, 'description is required'),
  targetType: z.enum(['customers', 'investors', 'startups', 'local_businesses']).optional(),
  goal: z.string().optional(),
  location: z.string().optional(),
});

/**
 * POST /api/brief
 * Body: ConversationInput → { brief: SearchBrief }
 * Turns the user's natural-language target (+ optional goal/type) into a
 * structured, editable brief. May include `needs_clarification`.
 */
export async function briefRoutes(app: FastifyInstance) {
  app.post('/api/brief', async (req, reply) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const brief = await container.brief.build(parsed.data);
    return { brief };
  });
}
