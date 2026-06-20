import { describe, expect, it } from 'vitest';
import { createBriefService } from '../src/services/brief';
import { MockLLMProvider } from '../src/providers/llm/mock';
import { StubLLMProvider } from './helpers/stubLlm';
import type { TargetType } from '../src/types';

const mockLlm = new MockLLMProvider();
const briefService = createBriefService(mockLlm);

describe('brief service (deterministic / mock LLM)', () => {
  const cases: { description: string; expected: TargetType; entity: 'people' | 'businesses' }[] = [
    {
      description: 'VC partners in London who back AI startups',
      expected: 'investors',
      entity: 'people',
    },
    {
      description: 'Founders of early-stage fintech startups raising seed in NYC',
      expected: 'startups',
      entity: 'businesses',
    },
    {
      description: 'Independent coffee shops and cafes in Manchester',
      expected: 'local_businesses',
      entity: 'businesses',
    },
    {
      description: 'VP of Sales at mid-market SaaS companies in the United States',
      expected: 'customers',
      entity: 'people',
    },
  ];

  it.each(cases)(
    'infers targetType=$expected for "$description"',
    async ({ description, expected, entity }) => {
      const brief = await briefService.build({ description, goal: 'Get product feedback' });
      expect(brief.targetType).toBe(expected);
      expect(brief.entity).toBe(entity);
    },
  );

  it('maps UK locations to ISO country codes for people searches', async () => {
    const brief = await briefService.build({
      description: 'Marketing directors in London',
      goal: 'Introduce our tool',
    });
    expect(brief.filters.prospect_country_code).toContain('GB');
    expect(brief.location?.toLowerCase()).toMatch(/london/);
  });

  it('maps US locations to ISO country codes for business searches', async () => {
    const brief = await briefService.build({
      description: 'New AI startups in San Francisco',
      goal: 'Explore partnership',
    });
    expect(brief.filters.company_country_code).toContain('US');
  });

  it('asks for goal when absent', async () => {
    const brief = await briefService.build({
      description: 'Investors in Berlin who back climate tech',
      location: 'Berlin',
    });
    const goalQ = brief.needs_clarification?.find((q) => q.field === 'goal');
    expect(goalQ).toBeDefined();
    expect(goalQ?.question).toMatch(/talk to them about/i);
  });

  it('does not ask for location when already provided', async () => {
    const brief = await briefService.build({
      description: 'Angel investors in London',
      location: 'London',
      goal: 'Pitch our startup',
    });
    const locQ = brief.needs_clarification?.find((q) => q.field === 'location');
    expect(locQ).toBeUndefined();
    expect(brief.needs_clarification?.length ?? 0).toBe(0);
  });

  it('falls back to deterministic parser when gemini throws', async () => {
    const failing = createBriefService(new StubLLMProvider({}, true));
    const brief = await failing.build({
      description: 'Local restaurants in Paris',
      goal: 'Offer our POS system',
    });
    expect(brief.targetType).toBe('local_businesses');
    expect(brief.goal).toBe('Offer our POS system');
  });

  it('normalizes invalid gemini targetType and entity', async () => {
    const stub = createBriefService(
      new StubLLMProvider({
        targetType: 'not_a_type',
        entity: 'businesses',
        looking_for: 'Bad type',
        goal: 'Test goal',
        filters: {},
      }),
    );
    const brief = await stub.build({
      description: 'VC partners in London',
      goal: 'Test goal',
    });
    expect(brief.targetType).toBe('investors');
    expect(brief.entity).toBe('people');
  });
});
