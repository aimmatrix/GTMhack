import type { FastifyInstance } from 'fastify';
import { container } from '../container';
import { config } from '../config';

/** GET /api/health — quick status + which providers are live vs mock. */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({
    ok: true,
    providers: {
      search: container.search.name,
      llm: container.llm.name,
      handoff: config.gmail.mode,
    },
    maxResults: config.maxResults,
    time: new Date().toISOString(),
  }));
}
