import type {
  Confidence,
  EnrichedCandidate,
  LLMProvider,
  ResearchNotes,
  ResearchService,
  SearchBrief,
} from '../types';
import { logger } from '../utils/logger';

const log = logger('research');

/**
 * Build a ResearchService backed by `llm`.
 *
 * - mock LLM → deterministic notes templated from the candidate's enrichment.
 * - gemini   → prompts the model with ONLY the candidate facts + brief, then
 *              validates and falls back to the deterministic builder on error.
 *
 * Everything is grounded in `candidate.enrichment` / `candidate.fields` /
 * `candidate.sources`; we never invent deal names, dates, or numbers that are
 * not present in the provided data.
 */
export function createResearchService(llm: LLMProvider): ResearchService {
  return {
    async analyze(candidate: EnrichedCandidate, brief: SearchBrief): Promise<ResearchNotes> {
      if (llm.name === 'mock') {
        return deterministicNotes(candidate, brief);
      }

      try {
        const prompt = buildResearchPrompt(candidate, brief);
        const raw = await llm.generateJson<Partial<ResearchNotes>>(prompt, RESEARCH_SCHEMA_HINT);
        return normalizeNotes(raw, candidate, brief);
      } catch (err) {
        log.warn('gemini research failed, using deterministic fallback', (err as Error).message);
        return deterministicNotes(candidate, brief);
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Gemini prompt + schema hint
// ──────────────────────────────────────────────────────────────────────────

const RESEARCH_SCHEMA_HINT = `{
  "why_match": string,        // 1 sentence tying this candidate to the brief
  "notes": string[],          // 2-4 short factual bullets, grounded in the facts
  "suggested_angle": string,  // 1 sentence outreach angle referencing the goal
  "confidence": "high" | "medium" | "low"
}`;

function buildResearchPrompt(candidate: EnrichedCandidate, brief: SearchBrief): string {
  const facts = collectFacts(candidate);
  return [
    'You write a short, grounded research note for a single outreach prospect.',
    '',
    'STRICT RULES — violations will be discarded:',
    '- Ground EVERY statement ONLY in the PROSPECT FACTS below.',
    '- Do NOT invent deal names, funding rounds, dates, dollar amounts, employee counts,',
    '  or any proper noun / number you cannot see in the facts.',
    '- If facts are thin (name/role/company only), write 2 honest generic bullets',
    '  (e.g. "Limited public data available") and set confidence to "low".',
    '- why_match: exactly 1 sentence linking this prospect to the brief (use role, company,',
    '  location, topics from facts only).',
    '- notes: 2 to 4 short bullets; each bullet must restate something from the facts.',
    `- suggested_angle: exactly 1 sentence that MUST mention the outreach goal:`,
    `  ${JSON.stringify(brief.goal ?? '(none — ask what they want to discuss)')}.`,
    '- confidence: "high" if 4+ concrete facts; "medium" if 2-3; "low" if 0-1.',
    '',
    '=== BRIEF ===',
    `looking_for: ${brief.looking_for}`,
    `targetType: ${brief.targetType}`,
    brief.location ? `location: ${brief.location}` : '',
    brief.interest ? `interest: ${brief.interest}` : '',
    `goal: ${brief.goal ?? '(none provided)'}`,
    '',
    '=== PROSPECT FACTS (the ONLY ground truth — do not go beyond this) ===',
    facts.length ? facts.map((f) => `- ${f}`).join('\n') : '- (no enrichment facts available)',
    '',
    `Prospect name: ${candidate.name}`,
    candidate.role ? `Role: ${candidate.role}` : '',
    candidate.company ? `Company: ${candidate.company}` : '',
    candidate.location ? `Location: ${candidate.location}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// ──────────────────────────────────────────────────────────────────────────
// Normalize / validate LLM notes
// ──────────────────────────────────────────────────────────────────────────

function normalizeNotes(
  raw: Partial<ResearchNotes>,
  candidate: EnrichedCandidate,
  brief: SearchBrief,
): ResearchNotes {
  const fallback = deterministicNotes(candidate, brief);
  const facts = collectFacts(candidate);
  const corpus = buildGroundTruthCorpus(candidate, facts);

  const why_match = nonEmpty(raw.why_match) ?? fallback.why_match;

  let notes = Array.isArray(raw.notes)
    ? raw.notes
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => n.trim())
    : [];
  notes = filterGroundedNotes(notes, corpus, facts);
  if (notes.length === 0) notes = fallback.notes;
  notes = notes.slice(0, 4);

  let suggested_angle = nonEmpty(raw.suggested_angle) ?? fallback.suggested_angle;
  suggested_angle = ensureAngleReferencesGoal(suggested_angle, brief, fallback.suggested_angle);

  let confidence = isConfidence(raw.confidence) ? raw.confidence : fallback.confidence;
  // Thin data + model overconfidence → cap at medium/low.
  if (facts.length <= 1 && confidence === 'high') confidence = 'low';
  if (facts.length <= 2 && confidence === 'high') confidence = 'medium';

  return { why_match, notes, suggested_angle, confidence };
}

// ──────────────────────────────────────────────────────────────────────────
// Anti-hallucination guard
// ──────────────────────────────────────────────────────────────────────────

/** Lowercase blob of every string the model is allowed to cite. */
function buildGroundTruthCorpus(candidate: EnrichedCandidate, facts: string[]): string {
  const parts = [
    candidate.name,
    candidate.company,
    candidate.role,
    candidate.location,
    candidate.email,
    candidate.domain,
    ...facts,
    ...(candidate.sources?.map((s) => s.title).filter(Boolean) as string[]),
  ].filter((p): p is string => Boolean(p));
  return parts.join(' ').toLowerCase();
}

/** Patterns that indicate a specific factual claim the model might invent. */
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const MONEY_RE = /\$[\d,.]+(?:\s*[kmb])?|\b[\d,.]+\s*(?:million|billion|m\b|usd)\b/gi;
const PERCENT_RE = /\b\d+(?:\.\d+)?%/g;
const SERIES_RE = /\bseries\s+[a-e]\b/gi;

const GENERIC_NOTE_RES = [
  /^limited public data/i,
  /^further research recommended/i,
  /^verified contact email/i,
  /^no enrichment facts/i,
];

/**
 * Drop notes that assert specifics (dates, amounts, series rounds, unknown proper
 * nouns) not present in the candidate corpus. Generic honest fallbacks pass through.
 */
function filterGroundedNotes(notes: string[], corpus: string, facts: string[]): string[] {
  return notes.filter((note) => isNoteGrounded(note, corpus, facts));
}

function isNoteGrounded(note: string, corpus: string, facts: string[]): boolean {
  if (GENERIC_NOTE_RES.some((re) => re.test(note))) return true;

  const noteLower = note.toLowerCase();

  // Specific numeric/date claims must appear in the corpus.
  for (const re of [YEAR_RE, MONEY_RE, PERCENT_RE, SERIES_RE]) {
    re.lastIndex = 0;
    const matches = note.match(re) ?? [];
    for (const m of matches) {
      if (!corpus.includes(m.toLowerCase())) return false;
    }
  }

  // Multi-word capitalized phrases (likely invented deal/company names).
  const properPhrases = note.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
  for (const phrase of properPhrases) {
    if (!corpus.includes(phrase.toLowerCase())) return false;
  }

  // Substantive tokens in the note should trace back to facts or candidate fields.
  const noteTokens = extractContentTokens(noteLower);
  const factTokens = new Set(facts.flatMap((f) => extractContentTokens(f.toLowerCase())));
  const corpusTokens = new Set(extractContentTokens(corpus));

  let unsupported = 0;
  for (const token of noteTokens) {
    if (token.length < 4) continue;
    if (factTokens.has(token) || corpusTokens.has(token)) continue;
    // Allow common outreach vocabulary that isn't a factual claim.
    if (OUTREACH_STOP.has(token)) continue;
    unsupported += 1;
  }

  // Allow a couple of glue words; reject notes mostly made of invented content.
  return unsupported <= 2;
}

const OUTREACH_STOP = new Set([
  'based', 'works', 'role', 'company', 'prospect', 'contact', 'email', 'available',
  'limited', 'public', 'data', 'research', 'recommended', 'before', 'outreach',
  'match', 'potential', 'customer', 'investor', 'startup', 'business', 'local',
  'focused', 'located', 'team', 'leadership', 'experience', 'industry',
]);

function extractContentTokens(text: string): string[] {
  return text
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Ensure suggested_angle mentions the brief goal when one exists. */
function ensureAngleReferencesGoal(
  angle: string,
  brief: SearchBrief,
  fallback: string,
): string {
  const goal = brief.goal?.trim();
  if (!goal) return angle;
  const goalWords = extractContentTokens(goal.toLowerCase()).filter((w) => w.length >= 4);
  const angleLower = angle.toLowerCase();
  const mentionsGoal =
    angleLower.includes(goal.toLowerCase()) ||
    goalWords.some((w) => angleLower.includes(w));
  return mentionsGoal ? angle : fallback;
}

// ──────────────────────────────────────────────────────────────────────────
// Deterministic builder (mock path + fallback)
// ──────────────────────────────────────────────────────────────────────────

function deterministicNotes(candidate: EnrichedCandidate, brief: SearchBrief): ResearchNotes {
  const facts = collectFacts(candidate);
  const name = candidate.name || 'This prospect';
  const role = candidate.role?.trim();
  const company = candidate.company?.trim();

  // why_match — tie the candidate to the brief using only known attributes.
  const why_match = buildWhyMatch(candidate, brief, role, company);

  // notes — 2..4 grounded bullets from concrete facts; pad with honest generics.
  const notes = buildNotes(candidate, facts, role, company);

  // suggested_angle — reference the goal explicitly.
  const suggested_angle = buildAngle(name, brief, company);

  // confidence — driven by how much real data we have.
  const confidence = scoreConfidence(candidate, facts);

  return { why_match, notes, suggested_angle, confidence };
}

function buildWhyMatch(
  candidate: EnrichedCandidate,
  brief: SearchBrief,
  role?: string,
  company?: string,
): string {
  const who = [role, company && `at ${company}`].filter(Boolean).join(' ');
  const subject = capitalize(who || candidate.name || 'This prospect');
  const label = targetLabel(brief.targetType);

  const tail: string[] = [];
  if (brief.interest) tail.push(`focused on ${brief.interest.toLowerCase()}`);
  if (brief.location) tail.push(`based in ${brief.location}`);
  const tailStr = tail.length ? `, ${tail.join(' and ')}` : '';

  return `${subject} is ${article(label)} ${label}${tailStr}.`;
}

function buildNotes(
  candidate: EnrichedCandidate,
  facts: string[],
  role?: string,
  company?: string,
): string[] {
  const notes: string[] = [];

  if (role && company) notes.push(`${role} at ${company}.`);
  else if (role) notes.push(`Role: ${role}.`);
  else if (company) notes.push(`Works at ${company}.`);

  if (candidate.location) notes.push(`Based in ${candidate.location}.`);

  // Pull a few of the richest enrichment facts (skip ones we already stated).
  const stated = new Set(notes.map((n) => n.toLowerCase()));
  for (const fact of facts) {
    if (notes.length >= 4) break;
    const line = fact.endsWith('.') ? fact : `${fact}.`;
    if (!stated.has(line.toLowerCase())) {
      notes.push(line);
      stated.add(line.toLowerCase());
    }
  }

  if (candidate.email) {
    if (notes.length < 4) notes.push('Verified contact email available.');
  }

  // Ensure at least 2 bullets, honestly generic if data is thin.
  if (notes.length === 0) {
    notes.push('Limited public data available for this prospect.');
  }
  if (notes.length === 1) {
    notes.push('Further research recommended before outreach.');
  }

  return notes.slice(0, 4);
}

function buildAngle(name: string, brief: SearchBrief, company?: string): string {
  const first = name.split(/\s+/)[0] || name;
  const goal = brief.goal?.trim();
  const who = company || first;
  if (goal) {
    // Em-dashes isolate the goal phrase so it reads cleanly whether the user
    // typed a noun phrase ("our hackathon project") or a verb phrase
    // ("introduce our product").
    return `Open with why ${who} is a fit, then reference your goal — ${lowerFirst(stripLeadingTo(goal))}.`;
  }
  return `Open with why ${who} is a fit, then connect it to your outreach goal.`;
}

/** Singular, human label for a target type. */
function targetLabel(t: SearchBrief['targetType']): string {
  switch (t) {
    case 'investors':
      return 'investor';
    case 'customers':
      return 'potential customer';
    case 'startups':
      return 'startup';
    case 'local_businesses':
      return 'local business';
    default:
      return 'match';
  }
}

function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

function scoreConfidence(candidate: EnrichedCandidate, facts: string[]): Confidence {
  let signal = facts.length;
  if (candidate.email) signal += 1;
  if (candidate.role) signal += 1;
  if (candidate.company) signal += 1;
  if ((candidate.sources?.length ?? 0) > 0) signal += 1;

  if (signal >= 5) return 'high';
  if (signal >= 2) return 'medium';
  return 'low';
}

// ──────────────────────────────────────────────────────────────────────────
// Fact collection — turn enrichment/fields into readable, grounded strings
// ──────────────────────────────────────────────────────────────────────────

function collectFacts(candidate: EnrichedCandidate): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const t = s.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      facts.push(t);
    }
  };

  const fromRecord = (rec: Record<string, unknown> | undefined) => {
    if (!rec) return;
    for (const [key, value] of Object.entries(rec)) {
      const rendered = renderValue(value);
      if (rendered) push(`${humanizeKey(key)}: ${rendered}`);
    }
  };

  fromRecord(candidate.enrichment);
  fromRecord(candidate.fields);

  // Source titles are legitimate, grounded context too.
  for (const src of candidate.sources ?? []) {
    if (src.title) push(`Source: ${src.title}`);
  }

  return facts;
}

function renderValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null))
      .filter((v): v is string => !!v && v.trim() !== '');
    return parts.length ? parts.join(', ') : null;
  }
  // Skip nested objects — we don't want to leak raw JSON into notes.
  return null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────────

function isConfidence(v: unknown): v is Confidence {
  return v === 'high' || v === 'medium' || v === 'low';
}

function nonEmpty(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function stripLeadingTo(s: string): string {
  return s.replace(/^to\s+/i, '');
}
