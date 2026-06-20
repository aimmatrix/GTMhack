/**
 * Search/data layer factory.
 *
 * `createSearchProvider()` picks the provider from config:
 *   - provider === 'unify'  → a resilient wrapper that tries the live Unify
 *     provider but transparently falls back to the mock provider for any call
 *     that throws at runtime (so a bad/missing key never breaks the demo).
 *   - otherwise             → the mock provider directly.
 */
import { config } from '../../config';
import type { Candidate, EnrichedCandidate, SearchBrief, SearchProvider } from '../../types';
import { logger } from '../../utils/logger';
import { MockSearchProvider } from './mock';
import { UnifySearchProvider } from './unify';

const log = logger('search');

/**
 * Wraps the live Unify provider and falls back to mock on any runtime error.
 * It keeps the `name` of the primary ('unify') so callers see the intended
 * provider, but quietly degrades per-call rather than failing the run.
 */
export class ResilientUnifyProvider implements SearchProvider {
  readonly name = 'unify' as const;

  private readonly primary: SearchProvider;
  private readonly fallback: SearchProvider;

  constructor(primary?: SearchProvider, fallback?: SearchProvider) {
    this.primary = primary ?? new UnifySearchProvider();
    this.fallback = fallback ?? new MockSearchProvider();
  }

  async search(brief: SearchBrief): Promise<Candidate[]> {
    try {
      return await this.primary.search(brief);
    } catch (err) {
      log.warn('unify.search failed — falling back to mock for this call', err);
      return this.fallback.search(brief);
    }
  }

  async enrich(candidate: Candidate, brief: SearchBrief): Promise<EnrichedCandidate> {
    try {
      return await this.primary.enrich(candidate, brief);
    } catch (err) {
      log.warn('unify.enrich failed — falling back to mock for this call', err);
      return this.fallback.enrich(candidate, brief);
    }
  }
}

export function createSearchProvider(): SearchProvider {
  if (config.search.provider === 'unify') {
    log.info('search provider: unify (with mock fallback)');
    return new ResilientUnifyProvider();
  }
  log.info('search provider: mock');
  return new MockSearchProvider();
}

export { MockSearchProvider } from './mock';
export { UnifySearchProvider, resolveB2bBaseUrl } from './unify';
