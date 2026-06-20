import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { container } from '../container';
import type { HandoffRequest } from '../types';

const handoffSchema = z.object({
  runId: z.string().optional(),
  cardId: z.string().optional(),
  packet: z.object({
    id: z.string().optional(),
    match: z.object({
      name: z.string().min(1),
      company: z.string().optional(),
      role: z.string().optional(),
      location: z.string().optional(),
      url: z.string().optional(),
      email: z.string().optional(),
    }),
    why_match: z.string().optional().default(''),
    notes: z.array(z.string()).optional().default([]),
    suggested_angle: z.string().optional().default(''),
    sources: z.array(z.object({ title: z.string().optional(), url: z.string() })).optional().default([]),
    confidence: z.enum(['high', 'medium', 'low']).optional().default('medium'),
    lightfern: z.any().optional(),
  }),
  sender: z
    .object({
      name: z.string().optional(),
      company: z.string().optional(),
      role: z.string().optional(),
      whatYouDo: z.string().optional(),
      goal: z.string().optional(),
      fromEmail: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/lightfern/handoff
 *   Body: HandoffRequest → { result: HandoffResult }
 *   Builds an email from the research packet and creates a Gmail draft (or a
 *   Gmail compose deep-link). The user then runs the Lightfern Chrome
 *   extension inside Gmail to polish/send.
 */
export async function handoffRoutes(app: FastifyInstance) {
  app.post('/api/lightfern/handoff', async (req, reply) => {
    const parsed = handoffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_input', details: parsed.error.flatten() });
    }
    const result = await container.handoff.handoff(parsed.data as HandoffRequest);
    return { result };
  });
}
