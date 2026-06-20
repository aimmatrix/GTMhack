import { describe, expect, it } from 'vitest';
import { createResearchService } from '../src/services/research';
import { MockLLMProvider } from '../src/providers/llm/mock';
import { StubLLMProvider } from './helpers/stubLlm';
import type { EnrichedCandidate, SearchBrief } from '../src/types';

const baseBrief: SearchBrief = {
  id: 'brief-1',
  targetType: 'customers',
  entity: 'people',
  looking_for: 'VP of Sales at SaaS companies',
  location: 'London',
  interest: 'SaaS',
  goal: 'Introduce our AI sales assistant',
  filters: {},
  max_results: 8,
  raw: { description: 'VP of Sales at SaaS companies in London', goal: 'Introduce our AI sales assistant' },
};

function makeCandidate(overrides: Partial<EnrichedCandidate> = {}): EnrichedCandidate {
  return {
    id: 'c-1',
    entity: 'people',
    name: 'Jane Smith',
    company: 'Acme SaaS',
    role: 'VP of Sales',
    location: 'London, UK',
    source: 'mock',
    sources: [{ title: 'LinkedIn Profile', url: 'https://linkedin.com/in/jane' }],
    enrichment: { industry: 'Software', employees: '51-200' },
    ...overrides,
  };
}

describe('research service (deterministic / mock LLM)', () => {
  const mockService = createResearchService(new MockLLMProvider());

  it('produces candidate-specific notes from enrichment', async () => {
    const candidate = makeCandidate();
    const notes = await mockService.analyze(candidate, baseBrief);
    expect(notes.notes.some((n) => n.includes('Acme SaaS') || n.includes('VP of Sales'))).toBe(true);
    expect(notes.suggested_angle.toLowerCase()).toMatch(/ai sales assistant|introduce/);
  });

  it('sets low confidence when enrichment is thin', async () => {
    const candidate = makeCandidate({
      enrichment: undefined,
      fields: undefined,
      role: undefined,
      company: undefined,
      location: undefined,
      email: undefined,
      sources: [],
    });
    const notes = await mockService.analyze(candidate, baseBrief);
    expect(notes.confidence).toBe('low');
    expect(notes.notes.some((n) => /limited|research recommended/i.test(n))).toBe(true);
  });

  it('suggested_angle references brief.goal', async () => {
    const candidate = makeCandidate();
    const notes = await mockService.analyze(candidate, baseBrief);
    expect(notes.suggested_angle.toLowerCase()).toContain('introduce');
  });
});

describe('research service (anti-hallucination guard)', () => {
  it('drops notes with invented funding rounds and dates', async () => {
    const candidate = makeCandidate({
      enrichment: { industry: 'Software' },
    });
    const stub = createResearchService(
      new StubLLMProvider({
        why_match: 'Jane is a VP of Sales at Acme SaaS.',
        notes: [
          'VP of Sales at Acme SaaS.',
          'Led a $50M Series B in 2024 with Sequoia Capital.',
          'Based in London, UK.',
        ],
        suggested_angle: 'Reference your goal — introduce our AI sales assistant.',
        confidence: 'high',
      }),
    );
    const notes = await stub.analyze(candidate, baseBrief);
    expect(notes.notes.some((n) => /series b|50m|2024|sequoia/i.test(n))).toBe(false);
    expect(notes.notes.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps notes that only restate provided facts', async () => {
    const candidate = makeCandidate();
    const stub = createResearchService(
      new StubLLMProvider({
        why_match: 'Jane Smith matches the VP of Sales brief.',
        notes: [
          'VP of Sales at Acme SaaS.',
          'Industry: Software.',
          'Based in London, UK.',
        ],
        suggested_angle: 'Open with why Acme SaaS is a fit, then introduce our AI sales assistant.',
        confidence: 'medium',
      }),
    );
    const notes = await stub.analyze(candidate, baseBrief);
    expect(notes.notes).toContain('VP of Sales at Acme SaaS.');
    expect(notes.notes.some((n) => n.includes('Software'))).toBe(true);
  });

  it('caps overconfident LLM when facts are thin', async () => {
    const candidate = makeCandidate({
      enrichment: undefined,
      fields: undefined,
      sources: [],
    });
    const stub = createResearchService(
      new StubLLMProvider({
        why_match: 'Jane Smith is a potential customer.',
        notes: ['Limited public data available.', 'Further research recommended before outreach.'],
        suggested_angle: 'Open with why Jane is a fit, then introduce our AI sales assistant.',
        confidence: 'high',
      }),
    );
    const notes = await stub.analyze(candidate, baseBrief);
    expect(notes.confidence).not.toBe('high');
  });

  it('repairs suggested_angle when goal is not mentioned', async () => {
    const candidate = makeCandidate();
    const stub = createResearchService(
      new StubLLMProvider({
        why_match: 'Good match.',
        notes: ['VP of Sales at Acme SaaS.', 'Based in London, UK.'],
        suggested_angle: 'Lead with a personalized opener about their role.',
        confidence: 'medium',
      }),
    );
    const notes = await stub.analyze(candidate, baseBrief);
    expect(notes.suggested_angle.toLowerCase()).toMatch(/introduce|ai sales/);
  });

  it('falls back to deterministic notes when gemini throws', async () => {
    const candidate = makeCandidate();
    const failing = createResearchService(new StubLLMProvider({}, true));
    const notes = await failing.analyze(candidate, baseBrief);
    expect(notes.notes.some((n) => n.includes('Acme SaaS'))).toBe(true);
  });
});
