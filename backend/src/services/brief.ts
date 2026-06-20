import { randomUUID } from 'node:crypto';
import type {
  BriefService,
  ClarifyingQuestion,
  ConversationInput,
  EntityKind,
  LLMProvider,
  SearchBrief,
  TargetType,
  UnifyFilters,
} from '../types';
import { TARGET_TYPES } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger('brief');

/**
 * Build a BriefService backed by `llm`.
 *
 * - mock LLM  → always uses the deterministic parser (keyless demo path).
 * - gemini    → prompts the model, then validates/normalizes the result and
 *               falls back to the deterministic parser on any error.
 *
 * Either way `build` always resolves to a complete, valid SearchBrief.
 */
export function createBriefService(llm: LLMProvider): BriefService {
  return {
    async build(input: ConversationInput): Promise<SearchBrief> {
      if (llm.name === 'mock') {
        return deterministicBrief(input);
      }

      try {
        const schemaHint = BRIEF_SCHEMA_HINT;
        const prompt = buildBriefPrompt(input);
        const rawBrief = await llm.generateJson<Partial<SearchBrief>>(prompt, schemaHint);
        return normalizeBrief(rawBrief, input);
      } catch (err) {
        log.warn('gemini brief failed, using deterministic fallback', (err as Error).message);
        return deterministicBrief(input);
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Gemini prompt + schema hint
// ──────────────────────────────────────────────────────────────────────────

/** Appended to the brief prompt so Gemini knows the exact JSON shape. */
const BRIEF_SCHEMA_HINT = `{
  "targetType": "customers" | "investors" | "startups" | "local_businesses",
  "entity": "people" | "businesses",
  "looking_for": string,                // human-readable "who" line
  "location": string,                   // human-readable location, "" if none
  "interest": string,                   // human-readable topic/interest, "" if none
  "goal": string,                       // outreach goal, "" if none
  "filters": {
    "job_title": string[],              // people only
    "job_level": string[],              // people only, e.g. ["cxo","vp","director"]
    "job_department": string[],         // people only
    "prospect_country_code": string[],  // people, ISO Alpha-2 e.g. ["GB"]
    "company_size": string[],           // businesses, e.g. ["1-10","11-50"]
    "company_country_code": string[],   // businesses, ISO Alpha-2 e.g. ["GB"]
    "city_region": string[],            // businesses, e.g. ["London"]
    "linkedin_category": string[],      // businesses, industry-ish
    "website_keywords": string[],       // businesses
    "business_intent_topics": string[], // businesses, "Category:Topic"
    "company_age": string[],            // businesses, e.g. ["0-3"]
    "freeText": string                  // anything unmapped
  }
}`;

function buildBriefPrompt(input: ConversationInput): string {
  return [
    'You convert a natural-language outreach request into a structured search brief',
    'for a B2B prospecting tool (Unify/Explorium style).',
    '',
    'TARGET TYPE (pick exactly one):',
    '- customers: B2B buyers, decision-makers, sales/marketing leaders at companies.',
    '- investors: VCs, angels, funds, LPs, partners who deploy capital.',
    '- startups: early-stage companies or founders raising/building (NOT the investors).',
    '- local_businesses: independent local shops, restaurants, salons, cafes, gyms.',
    '',
    'ENTITY (must match target type):',
    '- investors + customers → "people"',
    '- startups + local_businesses → "businesses"',
    '',
    'FILTERS — map only what the user text supports:',
    '- People: job_title, job_level (cxo|vp|director|manager|owner), job_department,',
    '  prospect_country_code (ISO Alpha-2, e.g. GB, US, DE).',
    '- Investors are PEOPLE at VC/PE firms: set job_title (e.g. "Partner" or "Investor")',
    '  AND linkedin_category ["venture capital"] so matches are real investors, not',
    '  consulting or accounting "partners".',
    '- Businesses: company_size (1-10|11-50|51-200|201-500|501-1000|1001-5000),',
    '  company_country_code (ISO Alpha-2), city_region, linkedin_category,',
    '  website_keywords, business_intent_topics ("Category:Topic"), company_age (0-3 for new).',
    '- Put unmapped nuance in filters.freeText; do NOT invent filters.',
    '',
    'HUMAN-READABLE LINES:',
    '- looking_for: one concise sentence describing WHO (not the goal).',
    '- location: readable place name if mentioned, else "".',
    '- interest: topics/industries mentioned, else "".',
    '- goal: outreach purpose from input; copy verbatim if provided, else "".',
    '',
    'LOCATION → ISO: London/UK → GB; NYC/New York/USA → US; Berlin/Germany → DE;',
    'Paris/France → FR; Amsterdam/Netherlands → NL; Dublin/Ireland → IE; Toronto/Canada → CA.',
    '',
    'Do NOT output needs_clarification — the server computes that.',
    'Ground everything in the user text; never invent locations, titles, or topics.',
    '',
    `Description: ${JSON.stringify(input.description || '')}`,
    `TargetType hint (may be empty — infer if absent): ${JSON.stringify(input.targetType ?? '')}`,
    `Goal (may be empty): ${JSON.stringify(input.goal ?? '')}`,
    `Location override (may be empty): ${JSON.stringify(input.location ?? '')}`,
  ].join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Normalize / validate an LLM-produced brief
// ──────────────────────────────────────────────────────────────────────────

function normalizeBrief(raw: Partial<SearchBrief>, input: ConversationInput): SearchBrief {
  // Start from the deterministic brief so every field has a sane default, then
  // overlay validated LLM output on top.
  const base = deterministicBrief(input);

  const targetType = isTargetType(raw.targetType) ? raw.targetType : base.targetType;
  const entity: EntityKind =
    raw.entity === 'people' || raw.entity === 'businesses'
      ? raw.entity
      : entityForTarget(targetType);

  // Entity must align with target type — correct mismatches from the model.
  const expectedEntity = entityForTarget(targetType);
  const alignedEntity = entity === expectedEntity ? entity : expectedEntity;

  const filters = sanitizeFilters(raw.filters, alignedEntity);
  // Keep the deterministic freeText if the LLM didn't provide one.
  if (!filters.freeText && base.filters.freeText) filters.freeText = base.filters.freeText;

  // Geography and investor industry are too important to leave to the model.
  // Enforce them deterministically: "London" must map to GB on the correct
  // field (Gemini sometimes uses city_region, which Explorium ignores for
  // non-US cities), and investors must always be constrained to VC/PE firms.
  const locs = parseLocations(
    input.location ? `${input.location} ${input.description ?? ''}` : input.description ?? '',
  );
  if (locs.countryCodes.length) {
    if (alignedEntity === 'people') filters.prospect_country_code = locs.countryCodes;
    else filters.company_country_code = locs.countryCodes;
  }
  if (targetType === 'investors' && !filters.linkedin_category?.length) {
    filters.linkedin_category = ['venture capital'];
  }

  const looking_for = nonEmptyString(raw.looking_for) ?? base.looking_for;
  const location = nonEmptyString(raw.location) ?? base.location;
  const interest = nonEmptyString(raw.interest) ?? base.interest;
  const goal = nonEmptyString(raw.goal) ?? base.goal;

  const brief: SearchBrief = {
    id: base.id,
    targetType,
    entity: alignedEntity,
    looking_for,
    location,
    interest,
    goal,
    filters,
    max_results: config.maxResults,
    raw: input,
    needs_clarification: computeClarifications(input, location ?? ''),
  };

  return brief;
}

function sanitizeFilters(raw: unknown, entity: EntityKind): UnifyFilters {
  const out: UnifyFilters = {};
  if (!raw || typeof raw !== 'object') return out;
  const f = raw as Record<string, unknown>;

  const peopleKeys: (keyof UnifyFilters)[] = [
    'job_title',
    'job_level',
    'job_department',
    'prospect_country_code',
    'prospect_region_country_code',
  ];
  const businessKeys: (keyof UnifyFilters)[] = [
    'company_size',
    'company_revenue',
    'company_country_code',
    'company_region_country_code',
    'city_region',
    'linkedin_category',
    'naics_category',
    'company_tech_stack_tech',
    'website_keywords',
    'business_intent_topics',
    'company_age',
  ];

  const allowed = entity === 'people'
    ? [...peopleKeys, 'has_email' as const]
    : businessKeys;

  for (const key of allowed) {
    const val = f[key];
    if (key === 'has_email') {
      if (typeof val === 'boolean') out.has_email = val;
      continue;
    }
    const arr = toStringArray(val);
    if (arr.length) (out as Record<string, unknown>)[key] = arr;
  }

  if (typeof f.freeText === 'string' && f.freeText.trim()) out.freeText = f.freeText.trim();

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Deterministic parser (mock path + fallback)
// ──────────────────────────────────────────────────────────────────────────

function deterministicBrief(input: ConversationInput): SearchBrief {
  const description = (input.description || '').trim();
  const text = description.toLowerCase();

  const targetType = input.targetType && isTargetType(input.targetType)
    ? input.targetType
    : inferTargetType(text);
  const entity = entityForTarget(targetType);

  const locations = parseLocations(input.location ? `${input.location} ${description}` : description);
  const filters = buildFilters(text, description, entity, locations, targetType);

  const looking_for = buildLookingFor(description, targetType);
  const interest = buildInterest(text, description);
  const goal = (input.goal || '').trim();

  const locationLine = input.location?.trim() || locations.label || '';

  const brief: SearchBrief = {
    id: randomUUID(),
    targetType,
    entity,
    looking_for,
    location: locationLine || undefined,
    interest: interest || undefined,
    goal: goal || undefined,
    filters,
    max_results: config.maxResults,
    raw: input,
    needs_clarification: computeClarifications(input, locationLine),
  };

  return brief;
}

// ── target-type inference ───────────────────────────────────────────────────

const INVESTOR_WORDS = ['invest', 'investor', 'vc', 'venture capital', 'angel', 'limited partner', 'backer', 'back ai', 'who back', 'lp ', 'general partner', 'vc partner'];
// "founder"/"startup" are the strongest startup signals; "raising" implies the
// company doing the raising (a startup), not the investor.
const STARTUP_STRONG = ['founder', 'co-founder', 'cofounder', 'raising', 'bootstrapped'];
const STARTUP_WORDS = [...STARTUP_STRONG, 'startup', 'start-up', 'seed', 'series a', 'series b', 'early-stage', 'early stage', 'incubator', 'accelerator'];
const LOCAL_WORDS = ['coffee', 'cafe', 'café', 'shop', 'restaurant', 'salon', 'local', 'independent', 'boutique', 'bakery', 'barber', 'gym', 'store', 'bar ', 'pub'];

function inferTargetType(text: string): TargetType {
  // A founder/"raising" framing describes the company being built, so it wins
  // even when investor words (seed, capital) also appear in the same sentence.
  if (matchesAny(text, STARTUP_STRONG)) return 'startups';
  if (matchesAny(text, INVESTOR_WORDS)) return 'investors';
  if (matchesAny(text, STARTUP_WORDS)) return 'startups';
  if (matchesAny(text, LOCAL_WORDS)) return 'local_businesses';
  return 'customers';
}

function entityForTarget(t: TargetType): EntityKind {
  // investors & customers -> people ; startups & local_businesses -> businesses
  return t === 'investors' || t === 'customers' ? 'people' : 'businesses';
}

// ── location parsing ────────────────────────────────────────────────────────

interface ParsedLocations {
  countryCodes: string[];
  cities: string[];
  /** Human label for the location line. */
  label: string;
}

// Minimal, high-confidence place → ISO Alpha-2 + canonical city label map.
const PLACE_MAP: { re: RegExp; code: string; city?: string; label: string }[] = [
  { re: /\b(london)\b/i, code: 'GB', city: 'London', label: 'London' },
  { re: /\b(manchester)\b/i, code: 'GB', city: 'Manchester', label: 'Manchester' },
  { re: /\b(u\.?k\.?|united kingdom|britain|england|scotland|wales)\b/i, code: 'GB', label: 'United Kingdom' },
  { re: /\b(new york|nyc|new york city)\b/i, code: 'US', city: 'New York', label: 'New York' },
  { re: /\b(san francisco|sf bay|bay area|silicon valley)\b/i, code: 'US', city: 'San Francisco', label: 'San Francisco' },
  { re: /\b(los angeles)\b/i, code: 'US', city: 'Los Angeles', label: 'Los Angeles' },
  { re: /\b(usa|u\.?s\.?a?\.?|united states|america|stateside)\b/i, code: 'US', label: 'United States' },
  { re: /\b(berlin)\b/i, code: 'DE', city: 'Berlin', label: 'Berlin' },
  { re: /\b(germany|deutschland)\b/i, code: 'DE', label: 'Germany' },
  { re: /\b(paris)\b/i, code: 'FR', city: 'Paris', label: 'Paris' },
  { re: /\b(france)\b/i, code: 'FR', label: 'France' },
  { re: /\b(amsterdam)\b/i, code: 'NL', city: 'Amsterdam', label: 'Amsterdam' },
  { re: /\b(netherlands|holland)\b/i, code: 'NL', label: 'Netherlands' },
  { re: /\b(dublin)\b/i, code: 'IE', city: 'Dublin', label: 'Dublin' },
  { re: /\b(ireland)\b/i, code: 'IE', label: 'Ireland' },
  { re: /\b(toronto)\b/i, code: 'CA', city: 'Toronto', label: 'Toronto' },
  { re: /\b(canada)\b/i, code: 'CA', label: 'Canada' },
  { re: /\b(singapore)\b/i, code: 'SG', city: 'Singapore', label: 'Singapore' },
  { re: /\b(sydney)\b/i, code: 'AU', city: 'Sydney', label: 'Sydney' },
  { re: /\b(australia)\b/i, code: 'AU', label: 'Australia' },
  { re: /\b(india)\b/i, code: 'IN', label: 'India' },
  { re: /\b(bangalore|bengaluru)\b/i, code: 'IN', city: 'Bangalore', label: 'Bangalore' },
];

function parseLocations(text: string): ParsedLocations {
  const countryCodes = new Set<string>();
  const cities = new Set<string>();
  const labels: string[] = [];

  for (const place of PLACE_MAP) {
    if (place.re.test(text)) {
      countryCodes.add(place.code);
      if (place.city) cities.add(place.city);
      if (!labels.includes(place.label)) labels.push(place.label);
    }
  }

  return {
    countryCodes: [...countryCodes],
    cities: [...cities],
    label: labels.join(', '),
  };
}

// ── filter building ─────────────────────────────────────────────────────────

const SIZE_HINTS: { re: RegExp; size: string }[] = [
  { re: /\b(solo|one person|1[- ]?person)\b/i, size: '1-10' },
  { re: /\b(small|smb|tiny)\b/i, size: '11-50' },
  { re: /\b(mid[- ]?market|medium|midsize)\b/i, size: '51-200' },
  { re: /\b(enterprise|large)\b/i, size: '1001-5000' },
];

const SENIORITY_HINTS: { re: RegExp; level: string }[] = [
  { re: /\b(c-?level|cxo|ceo|cto|cfo|cmo|coo|chief)\b/i, level: 'cxo' },
  { re: /\b(vp|vice president)\b/i, level: 'vp' },
  { re: /\b(director|head of)\b/i, level: 'director' },
  { re: /\b(manager)\b/i, level: 'manager' },
  { re: /\b(founder|co-?founder)\b/i, level: 'owner' },
];

const DEPARTMENT_HINTS: { re: RegExp; dept: string }[] = [
  { re: /\b(sales|revenue|account exec|sdr|bdr)\b/i, dept: 'sales' },
  { re: /\b(marketing|growth|demand gen)\b/i, dept: 'marketing' },
  { re: /\b(engineering|developer|devops|software)\b/i, dept: 'engineering' },
  { re: /\b(product)\b/i, dept: 'product' },
  { re: /\b(finance|accounting)\b/i, dept: 'finance' },
  { re: /\b(hr|recruit|recruiting|recruiter|talent|people ops|people team|head of people)\b/i, dept: 'human resources' },
  { re: /\b(operations|ops)\b/i, dept: 'operations' },
];

// Topic keywords → website_keywords / business_intent / interest signals.
const TOPIC_HINTS = [
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'sales tools', 'saas',
  'fintech', 'healthtech', 'edtech', 'climate', 'crypto', 'web3', 'developer tools',
  'cybersecurity', 'security', 'data', 'analytics', 'ecommerce', 'e-commerce',
  'marketplace', 'b2b', 'b2c', 'devtools', 'automation', 'agents', 'llm',
];

function buildFilters(
  text: string,
  description: string,
  entity: EntityKind,
  locations: ParsedLocations,
  targetType: TargetType,
): UnifyFilters {
  const filters: UnifyFilters = {};
  const mapped = new Set<string>();

  const topics = TOPIC_HINTS.filter((t) => matchesTopic(text, t));

  if (entity === 'people') {
    const titles = extractJobTitles(text, targetType);
    if (titles.length) {
      filters.job_title = titles;
      titles.forEach((t) => mapped.add(t.toLowerCase()));
    }

    const levels = uniq(SENIORITY_HINTS.filter((h) => h.re.test(text)).map((h) => h.level));
    if (levels.length) filters.job_level = levels;

    const depts = uniq(DEPARTMENT_HINTS.filter((h) => h.re.test(text)).map((h) => h.dept));
    if (depts.length) filters.job_department = depts;

    // Investors are people whose COMPANY is a VC/PE firm. Constrain by industry
    // so results are actual investors, not consulting/accounting "partners".
    // The search provider standardizes this to the canonical Explorium category.
    if (targetType === 'investors') {
      filters.linkedin_category = ['venture capital'];
    }

    if (locations.countryCodes.length) filters.prospect_country_code = locations.countryCodes;
  } else {
    const sizes = uniq(SIZE_HINTS.filter((h) => h.re.test(text)).map((h) => h.size));
    if (sizes.length) filters.company_size = sizes;

    if (locations.countryCodes.length) filters.company_country_code = locations.countryCodes;
    if (locations.cities.length) filters.city_region = locations.cities;

    // New/early-stage business → young company age.
    if (targetType === 'startups' || /\b(new|newly|recently)\b/i.test(text)) {
      filters.company_age = ['0-3'];
    }

    const category = inferLinkedinCategory(text, targetType);
    if (category.length) filters.linkedin_category = category;

    if (topics.length) {
      filters.website_keywords = topics;
      filters.business_intent_topics = topics.map((t) => `Technology:${titleCase(t)}`);
      topics.forEach((t) => mapped.add(t));
    }
  }

  // Anything notable not captured -> freeText. Use the raw description so the
  // search provider can still see nuance we didn't structure.
  const leftover = computeLeftover(description, mapped, locations);
  if (leftover) filters.freeText = leftover;

  return filters;
}

function extractJobTitles(text: string, targetType: TargetType): string[] {
  const titles = new Set<string>();

  if (targetType === 'investors') {
    if (/\bangel\b/i.test(text)) titles.add('Angel Investor');
    if (/\b(vc|venture|partner|gp)\b/i.test(text)) titles.add('Partner');
    if (/\b(investor|invest)\b/i.test(text)) titles.add('Investor');
    if (!titles.size) titles.add('Investor');
    return [...titles];
  }

  // Common explicit roles in customer searches.
  const roleMap: { re: RegExp; title: string }[] = [
    { re: /\bceo\b/i, title: 'CEO' },
    { re: /\bcto\b/i, title: 'CTO' },
    { re: /\bcfo\b/i, title: 'CFO' },
    { re: /\bcmo\b/i, title: 'CMO' },
    { re: /\bcoo\b/i, title: 'COO' },
    { re: /\bvp (of )?sales\b/i, title: 'VP of Sales' },
    { re: /\bvp (of )?marketing\b/i, title: 'VP of Marketing' },
    { re: /\bvp (of )?engineering\b/i, title: 'VP of Engineering' },
    { re: /\bhead of (sales|growth|marketing|product|engineering)\b/i, title: 'Head of $1' },
    { re: /\b(sales|revenue) (lead|leader|director|manager)\b/i, title: 'Sales Leader' },
    { re: /\bmarketing (lead|leader|director|manager)\b/i, title: 'Marketing Leader' },
    { re: /\bproduct manager\b/i, title: 'Product Manager' },
    { re: /\bfounder\b/i, title: 'Founder' },
  ];

  for (const { re, title } of roleMap) {
    const m = text.match(re);
    if (m) {
      titles.add(title.includes('$1') && m[1] ? title.replace('$1', titleCase(m[1])) : title);
    }
  }

  return [...titles];
}

function inferLinkedinCategory(text: string, targetType: TargetType): string[] {
  const cats = new Set<string>();
  if (targetType === 'local_businesses') {
    if (/\b(coffee|cafe|café)\b/i.test(text)) cats.add('Food & Beverages');
    if (/\b(restaurant|bakery|bar|pub)\b/i.test(text)) cats.add('Restaurants');
    if (/\b(salon|barber|spa)\b/i.test(text)) cats.add('Consumer Services');
    if (/\b(gym|fitness)\b/i.test(text)) cats.add('Health, Wellness & Fitness');
    if (/\b(shop|store|retail|boutique)\b/i.test(text)) cats.add('Retail');
  }
  if (/\b(saas|software)\b/i.test(text)) cats.add('Computer Software');
  if (/\bfintech\b/i.test(text)) cats.add('Financial Services');
  return [...cats];
}

// ── human-readable lines ────────────────────────────────────────────────────

function buildLookingFor(description: string, targetType: TargetType): string {
  if (description) return description;
  const defaults: Record<TargetType, string> = {
    customers: 'Potential customers',
    investors: 'Investors',
    startups: 'Startups and founders',
    local_businesses: 'Local businesses',
  };
  return defaults[targetType];
}

function buildInterest(text: string, _description: string): string {
  const topics = TOPIC_HINTS.filter((t) => matchesTopic(text, t));
  if (!topics.length) return '';
  // De-dupe overlapping synonyms loosely and title-case for display.
  return uniq(topics.map(titleCase)).join(', ');
}

// ── clarifications ──────────────────────────────────────────────────────────

function computeClarifications(input: ConversationInput, locationLine: string): ClarifyingQuestion[] {
  const out: ClarifyingQuestion[] = [];

  if (!input.goal || !input.goal.trim()) {
    out.push({
      field: 'goal',
      question: 'What do you want to talk to them about?',
      examples: [
        'Introduce our Lightfern hackathon project',
        'Get feedback on our AI sales tool',
        'Explore a partnership',
      ],
    });
  }

  // Only ask about location if it is totally absent everywhere.
  const hasLocation =
    !!locationLine.trim() ||
    !!(input.location && input.location.trim());
  if (!hasLocation) {
    out.push({
      field: 'location',
      question: 'Any particular location or region?',
      examples: ['London', 'United States', 'Anywhere'],
    });
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────

function isTargetType(v: unknown): v is TargetType {
  return typeof v === 'string' && (TARGET_TYPES as string[]).includes(v);
}

function matchesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/**
 * Whole-token match for topic keywords so short tokens like "ai" don't match
 * inside unrelated words ("raising", "rain"). Allows the topic to be bounded by
 * non-alphanumerics on both sides.
 */
function matchesTopic(text: string, topic: string): boolean {
  const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(text);
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return uniq(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()));
  }
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function nonEmptyString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a freeText remainder: keep meaningful words from the description that
 * weren't already captured by a structured filter or a recognized location.
 */
function computeLeftover(
  description: string,
  mapped: Set<string>,
  locations: ParsedLocations,
): string {
  if (!description) return '';
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'in', 'at', 'of', 'to', 'for', 'with', 'who',
    'that', 'back', 'who', 'our', 'we', 'are', 'is', 'who', 'find', 'looking',
    'want', 'reach', 'people', 'companies', 'company', 'business', 'businesses',
  ]);
  const locationWords = new Set(
    [...locations.cities, ...locations.label.split(/[,\s]+/)].map((s) => s.toLowerCase()),
  );

  const words = description
    .split(/[^a-zA-Z0-9+]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const remaining = words.filter((w) => {
    const lw = w.toLowerCase();
    if (stop.has(lw)) return false;
    if (locationWords.has(lw)) return false;
    if (mapped.has(lw)) return false;
    return true;
  });

  // Only emit a remainder if there's signal beyond a couple of stopwords.
  if (remaining.length < 2) return '';
  return remaining.join(' ');
}
