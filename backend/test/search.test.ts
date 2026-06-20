import { describe, expect, it } from 'vitest';
import type { SearchBrief, SearchProvider } from '../src/types';
import { TARGET_TYPES } from '../src/types';
import { FIXTURES } from '../src/providers/search/fixtures';
import { MockSearchProvider } from '../src/providers/search/mock';
import { ResilientUnifyProvider } from '../src/providers/search/index';
import { UnifySearchProvider, resolveB2bBaseUrl } from '../src/providers/search/unify';

function brief(overrides: Partial<SearchBrief> & Pick<SearchBrief, 'targetType'>): SearchBrief {
  return {
    id: 'test-brief',
    targetType: overrides.targetType,
    entity: overrides.entity ?? (overrides.targetType === 'customers' || overrides.targetType === 'investors' ? 'people' : 'businesses'),
    looking_for: overrides.looking_for ?? 'test search',
    filters: overrides.filters ?? {},
    max_results: overrides.max_results ?? 8,
    raw: { description: 'test' },
    ...overrides,
  };
}

describe('MockSearchProvider', () => {
  const provider = new MockSearchProvider();

  it.each(TARGET_TYPES)('returns fixtures for target type %s', async (targetType) => {
    const results = await provider.search(brief({ targetType }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((c) => c.source === 'mock')).toBe(true);
    const pool = FIXTURES[targetType];
    expect(results.length).toBeLessThanOrEqual(pool.length);
  });

  it('narrows investors when filtering by AI sales tools', async () => {
    const results = await provider.search(
      brief({
        targetType: 'investors',
        filters: { business_intent_topics: ['AI sales tools'] },
        interest: 'AI sales tools',
        max_results: 5,
      }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((c) => JSON.stringify(c.fields ?? {}).toLowerCase().includes('ai sales')),
    ).toBe(true);
  });

  it('narrows local businesses when filtering by Shoreditch', async () => {
    const results = await provider.search(
      brief({
        targetType: 'local_businesses',
        location: 'Shoreditch',
        max_results: 5,
      }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => (c.location ?? '').toLowerCase().includes('shoreditch'))).toBe(true);
  });

  it('enrich always yields email and at least two sources', async () => {
    for (const targetType of TARGET_TYPES) {
      const [candidate] = await provider.search(brief({ targetType, max_results: 1 }));
      const enriched = await provider.enrich(candidate, brief({ targetType }));
      expect(enriched.email).toBeTruthy();
      expect(enriched.sources.length).toBeGreaterThanOrEqual(2);
      expect(enriched.sources.every((s) => s.url.startsWith('http'))).toBe(true);
    }
  });
});

describe('ResilientUnifyProvider fallback', () => {
  it('falls back to mock when the live provider throws', async () => {
    class FailingProvider implements SearchProvider {
      readonly name = 'unify' as const;
      async search() {
        throw new Error('simulated API failure');
      }
      async enrich() {
        throw new Error('simulated enrich failure');
      }
    }

    const resilient = new ResilientUnifyProvider(new FailingProvider());

    const results = await resilient.search(brief({ targetType: 'investors' }));
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('mock');

    const [candidate] = results;
    const enriched = await resilient.enrich(candidate, brief({ targetType: 'investors' }));
    expect(enriched.email).toBeTruthy();
    expect(enriched.sources.length).toBeGreaterThanOrEqual(2);
  });
});

describe('resolveB2bBaseUrl', () => {
  it('redirects Unify CRM Data API host to Explorium B2B', () => {
    expect(resolveB2bBaseUrl('https://api.unifygtm.com/data/v1')).toBe('https://api.explorium.ai/v1');
    expect(resolveB2bBaseUrl('https://api.explorium.ai/v1')).toBe('https://api.explorium.ai/v1');
  });
});

describe('UnifySearchProvider (live)', () => {
  // Unify CRM keys (u_*) do not include Explorium B2B — set UNIFY_LIVE_TEST=1 with a
  // Partner API key to run integration probes.
  const runLive = process.env.UNIFY_LIVE_TEST === '1' && !!process.env.UNIFY_API_KEY;
  const live = runLive ? new UnifySearchProvider() : null;

  it.skipIf(!runLive)('search returns mapped candidates from live API', async () => {
    const results = await live!.search(
      brief({
        targetType: 'investors',
        entity: 'people',
        filters: {
          job_title: ['Partner'],
          company_country_code: ['GB'],
          has_email: true,
        },
        max_results: 3,
      }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toBe('unify');
    expect(results[0].name).toBeTruthy();
    expect(results[0].fields).toBeDefined();
  }, 60_000);

  it.skipIf(!runLive)('enrich returns email and sources from live API', async () => {
    const [candidate] = await live!.search(
      brief({
        targetType: 'investors',
        entity: 'people',
        filters: { company_country_code: ['GB'], has_email: true },
        max_results: 1,
      }),
    );
    const enriched = await live!.enrich(candidate, brief({ targetType: 'investors' }));
    expect(enriched.sources.length).toBeGreaterThanOrEqual(1);
    // Email may be absent on miss — enrichment should still return structure.
    expect(enriched.enrichment).toBeDefined();
  }, 60_000);
});
