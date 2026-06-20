import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { logger } from './utils/logger';
import { healthRoutes } from './routes/health';
import { briefRoutes } from './routes/brief';
import { runRoutes } from './routes/run';
import { handoffRoutes } from './routes/handoff';

const log = logger('server');

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  });

  app.register(healthRoutes);
  app.register(briefRoutes);
  app.register(runRoutes);
  app.register(handoffRoutes);

  app.get('/', async () => ({
    service: 'lightfern-reach-backend',
    endpoints: ['/api/health', 'POST /api/brief', 'POST /api/run (SSE)', 'GET /api/run/:id', 'POST /api/lightfern/handoff'],
  }));

  app.setErrorHandler((err, _req, reply) => {
    log.error(`unhandled error: ${err.message}`, err);
    if (!reply.sent) {
      reply.code(err.statusCode ?? 500).send({ error: 'server_error', message: err.message });
    }
  });

  return app;
}
