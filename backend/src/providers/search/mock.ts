/**
 * MockSearchProvider — zero-dependency search/data layer.
 *
 * Serves the rich fixtures in `fixtures.ts` so Lightfern Reach demos end-to-end
 * with no API keys. `search` does light, forgiving filtering against the brief
 * (structured filters + free-text/location tokens) and always tops up to a
 * usable result count. `enrich` synthesises a plausible email/phone and source
 * links and never throws.
 */
import type {
  Candidate,
  EnrichedCandidate,
  SearchBrief,
  SearchProvider,
  SourceLink,
  UnifyFilters,
} from '../../types';
import { logger } from '../../utils/logger';
import { FIXTURES } from './fixtures';

const log = logger('search');

/** Lowercase a value safely for substring matching. */
function lc(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

/** Flatten a candidate's searchable text (name/company/role/location + fields). */
function haystack(c: Candidate): string {
  const base = [c.name, c.company, c.role, c.location, c.domain, c.url].map(lc).join(' ');
  const fieldText = c.fields ? lc(JSON.stringify(c.fields)) : '';
  return `${base} ${fieldText}`;
}

/**
 * Collect lowercase free-text tokens implied by the brief: explicit free text,
 * the location line, interest line, and any string values inside the filters.
 * These are matched as case-insensitive substrings — deliberately lenient so
 * the demo surfaces results rather than over-filtering.
 */
function briefTokens(brief: SearchBrief): string[] {
  const tokens: string[] = [];
  const push = (v?: string) => {
    if (!v) return;
    for (const part of v.split(/[\s,/]+/)) {
      const t = part.trim().toLowerCase();
      // Skip very short / generic words that would match everything.
      if (t.length >= 3 && !STOP_WORDS.has(t)) tokens.push(t);
    }
  };

  push(brief.location);
  push(brief.interest);
  push(brief.filters.freeText);

  for (const v of filterStringValues(brief.filters)) push(v);

  return Array.from(new Set(tokens));
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'who',
  'with',
  'are',
  'that',
  'this',
  'back',
  'backs',
  'based',
  'inc',
  'ltd',
  'llc',
]);

/** Pull human-meaningful string values out of the structured filters. */
function filterStringValues(filters: UnifyFilters): string[] {
  const out: string[] = [];
  const arrays: (string[] | undefined)[] = [
    filters.job_title,
    filters.job_level,
    filters.job_department,
    filters.company_size,
    filters.city_region,
    filters.linkedin_category,
    filters.naics_category,
    filters.company_tech_stack_tech,
    filters.website_keywords,
    filters.business_intent_topics,
  ];
  for (const a of arrays) {
    if (a) out.push(...a);
  }
  return out;
}

/** Derive a domain-ish slug from a candidate for email synthesis. */
function emailDomain(c: Candidate): string {
  if (c.domain) return c.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (c.url) {
    try {
      return new URL(c.url).hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  const slug = (c.company || c.name || 'example')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return `${slug || 'example'}.com`;
}

/** Build a `first.last@domain` style email from a person's name. */
function synthEmail(c: Candidate): string {
  const domain = emailDomain(c);
  const parts = c.name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (c.entity === 'businesses' || parts.length === 0) {
    return `hello@${domain}`;
  }
  if (parts.length === 1) return `${parts[0]}@${domain}`;
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first}.${last}@${domain}`;
}

/** A deterministic but realistic-looking UK phone number, seeded by id. */
function synthPhone(c: Candidate): string {
  let seed = 0;
  for (const ch of c.id) seed = (seed * 31 + ch.charCodeAt(0)) % 1_000_000;
  const block = (seed % 900000) + 100000; // 6 digits
  return `+44 20 ${String(block).slice(0, 4)} ${String(block).slice(2, 6)}`;
}

/** Build 2–3 source links from a candidate's known urls. */
function buildSources(c: Candidate): SourceLink[] {
  const sources: SourceLink[] = [];
  if (c.url) sources.push({ title: `${c.company || c.name} — website`, url: c.url });
  if (c.linkedin) sources.push({ title: `${c.name} on LinkedIn`, url: c.linkedin });

  const fieldUrls = c.fields?.source_urls;
  if (Array.isArray(fieldUrls)) {
    for (const raw of fieldUrls) {
      if (typeof raw === 'string' && raw.startsWith('http')) {
        sources.push({ title: `${c.company || c.name} — reference`, url: raw });
      }
    }
  }

  if (sources.length < 2) {
    const domain = emailDomain(c);
    sources.push({ title: `${c.company || c.name} — about`, url: `https://${domain}/about` });
  }
  return sources.slice(0, 3);
}

export class MockSearchProvider implements SearchProvider {
  readonly name = 'mock' as const;

  async search(brief: SearchBrief): Promise<Candidate[]> {
    const pool = FIXTURES[brief.targetType] ?? [];
    const limit = Math.max(1, brief.max_results || pool.length);
    const tokens = briefTokens(brief);

    let matched: Candidate[];
    if (tokens.length === 0) {
      matched = pool.slice();
    } else {
      matched = pool.filter((c) => {
        const hay = haystack(c);
        // Lenient OR-match: any token hit keeps the candidate.
        return tokens.some((t) => hay.includes(t));
      });
    }

    // Top up from the same target-type list so the demo always shows results.
    if (matched.length < limit) {
      const seen = new Set(matched.map((c) => c.id));
      for (const c of pool) {
        if (matched.length >= limit) break;
        if (!seen.has(c.id)) {
          matched.push(c);
          seen.add(c.id);
        }
      }
    }

    const results = matched.slice(0, limit);
    log.debug(
      `mock.search targetType=${brief.targetType} tokens=[${tokens.join(',')}] -> ${results.length} candidates`,
    );
    return results;
  }

  async enrich(candidate: Candidate, _brief: SearchBrief): Promise<EnrichedCandidate> {
    // Never throw: synthesise contact + sources from what the candidate carries.
    const email = synthEmail(candidate);
    const phone = candidate.entity === 'people' ? synthPhone(candidate) : undefined;
    const enrichment: Record<string, unknown> = { ...(candidate.fields ?? {}) };

    return {
      ...candidate,
      email,
      phone,
      enrichment,
      sources: buildSources(candidate),
    };
  }
}
