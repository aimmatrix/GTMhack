import { buildServer } from './server';
import { config } from './config';
import { logger } from './utils/logger';

const log = logger('boot');

async function main() {
  const app = buildServer();
  try {
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    log.info(`Lightfern Reach API listening on ${address}`);
    log.info(
      `mode: search=${config.search.provider} · llm=${config.llm.provider} · handoff=${config.gmail.mode}`,
    );
    if (config.search.provider === 'mock') log.warn('UNIFY_API_KEY not set — using mock search data.');
    if (config.llm.provider === 'mock') log.warn('GEMINI_API_KEY not set — using deterministic notes.');
  } catch (err) {
    log.error('failed to start server', err);
    process.exit(1);
  }
}

main();
