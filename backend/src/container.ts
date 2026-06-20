import { config } from './config';
import { createSearchProvider } from './providers/search';
import { createLLMProvider } from './providers/llm';
import { createBriefService } from './services/brief';
import { createResearchService } from './services/research';
import { createHandoffService } from './handoff';
import { InMemoryRunStore } from './store/runStore';
import { SupabaseRunStore } from './store/supabaseStore';
import type { RunStore } from './types';
import { logger } from './utils/logger';

/**
 * Composition root. Builds one instance of every provider/service and wires
 * dependencies. Routes and the orchestrator read from `container`.
 */
const log = logger('container');

const llm = createLLMProvider();

function createRunStore(): RunStore {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (url && key) {
    log.info('run store: supabase');
    return new SupabaseRunStore(url, key);
  }
  return new InMemoryRunStore();
}

export const container = {
  config,
  llm,
  search: createSearchProvider(),
  brief: createBriefService(llm),
  research: createResearchService(llm),
  handoff: createHandoffService(),
  store: createRunStore(),
};

export type Container = typeof container;

log.info(
  `providers wired: search=${container.search.name} llm=${container.llm.name} handoff=${config.gmail.mode}`,
);
