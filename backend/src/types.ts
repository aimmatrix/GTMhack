/**
 * Lightfern Reach — shared contract.
 *
 * This file is the single source of truth for every module and the frontend.
 * Providers (search/llm/handoff) implement the interfaces here; routes speak
 * the DTOs here; the orchestrator wires them together. If you need to change a
 * shape, change it here so all workstreams stay in sync.
 */

// ──────────────────────────────────────────────────────────────────────────
// Domain primitives
// ──────────────────────────────────────────────────────────────────────────

export type TargetType = 'customers' | 'investors' | 'startups' | 'local_businesses';

/** Whether a brief resolves to individual people or to companies. */
export type EntityKind = 'people' | 'businesses';

export type Confidence = 'high' | 'medium' | 'low';

export const TARGET_TYPES: TargetType[] = [
  'customers',
  'investors',
  'startups',
  'local_businesses',
];

// ──────────────────────────────────────────────────────────────────────────
// Conversation input  →  Brief
// ──────────────────────────────────────────────────────────────────────────

/** Raw conversational input from the first screen + follow-up. */
export interface ConversationInput {
  /** "Who do you want to reach?" — free text. */
  description: string;
  /** Optional chip the user picked; inferred if absent. */
  targetType?: TargetType;
  /** "What do you want to talk to them about?" — the outreach goal. */
  goal?: string;
  /** Optional explicit location override. */
  location?: string;
}

/** One short follow-up the app may ask before it can search well. */
export interface ClarifyingQuestion {
  /** Which brief field this resolves, e.g. "goal" | "location" | "scope". */
  field: string;
  question: string;
  examples?: string[];
}

/**
 * Normalized Unify/Explorium-style filters. The search provider maps these to
 * the live API (autocomplete-standardized) or to mock fixtures. All optional —
 * include only what the brief implies. See Unify/Explorium `fetch-entities`.
 */
export interface UnifyFilters {
  /** People filters */
  job_title?: string[];
  job_level?: string[];
  job_department?: string[];
  prospect_country_code?: string[]; // ISO Alpha-2, person location
  prospect_region_country_code?: string[]; // ISO 3166-2
  has_email?: boolean;

  /** Company filters */
  company_size?: string[]; // e.g. "51-200"
  company_revenue?: string[]; // e.g. "1M-5M"
  company_country_code?: string[]; // ISO Alpha-2, HQ
  company_region_country_code?: string[]; // ISO 3166-2
  city_region?: string[]; // standardized via autocomplete
  linkedin_category?: string[]; // standardized via autocomplete
  naics_category?: string[]; // standardized via autocomplete
  company_tech_stack_tech?: string[];
  website_keywords?: string[];
  business_intent_topics?: string[]; // "Category:Topic", standardized
  company_age?: string[]; // e.g. "0-3"

  /** Free-text remainder we couldn't map to a structured filter. */
  freeText?: string;
}

/** The structured, editable brief shown to the user before searching. */
export interface SearchBrief {
  id: string;
  /** Resolved (or inferred) target type. */
  targetType: TargetType;
  /** Whether we will search people or companies. */
  entity: EntityKind;
  /** Human-readable "Looking for" line. */
  looking_for: string;
  /** Human-readable location line, if any. */
  location?: string;
  /** Human-readable interest/topic line, if any. */
  interest?: string;
  /** The outreach goal (what they want to talk about). */
  goal?: string;
  /** Structured filters for the search provider. */
  filters: UnifyFilters;
  /** Cap on returned matches. */
  max_results: number;
  /** The original conversational input. */
  raw: ConversationInput;
  /**
   * If present and non-empty, the app should ask these before running.
   * Empty/absent => brief is ready to search.
   */
  needs_clarification?: ClarifyingQuestion[];
}

// ──────────────────────────────────────────────────────────────────────────
// Search results
// ──────────────────────────────────────────────────────────────────────────

export interface SourceLink {
  title?: string;
  url: string;
}

/** A raw search hit before enrichment/research. */
export interface Candidate {
  id: string;
  entity: EntityKind;
  name: string;
  company?: string;
  role?: string;
  location?: string;
  url?: string;
  linkedin?: string;
  domain?: string;
  /** Where this came from. */
  source: 'unify' | 'mock';
  /** Provider-specific raw fields for downstream enrichment/research. */
  fields?: Record<string, unknown>;
}

/** A candidate after enrichment (contact + firmographic detail + sources). */
export interface EnrichedCandidate extends Candidate {
  email?: string;
  phone?: string;
  /** Free-form enrichment facts the research layer can ground notes in. */
  enrichment?: Record<string, unknown>;
  sources: SourceLink[];
}

// ──────────────────────────────────────────────────────────────────────────
// Research notes  →  Match card (the PRD "research packet")
// ──────────────────────────────────────────────────────────────────────────

export interface ResearchNotes {
  why_match: string;
  notes: string[];
  suggested_angle: string;
  confidence: Confidence;
}

export type LightfernCompletionStatus = 'ready' | 'partial' | 'unavailable';

/** The streamed unit the dashboard renders, mirroring the PRD packet. */
export interface MatchCard {
  id: string;
  match: {
    name: string;
    company?: string;
    role?: string;
    location?: string;
    url?: string;
    email?: string;
  };
  why_match: string;
  notes: string[];
  suggested_angle: string;
  sources: SourceLink[];
  confidence: Confidence;
  lightfern: {
    completion_status: LightfernCompletionStatus;
    completed_fields: string[];
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Run state
// ──────────────────────────────────────────────────────────────────────────

export type RunStatus = 'pending' | 'running' | 'completed' | 'error';

export interface RunStats {
  found: number;
  researched: number;
  /** Matches dropped for being weak/low-confidence. */
  dropped: number;
}

export interface RunState {
  id: string;
  status: RunStatus;
  brief: SearchBrief;
  cards: MatchCard[];
  stats: RunStats;
  error?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ──────────────────────────────────────────────────────────────────────────
// SSE events streamed from POST /api/run
// ──────────────────────────────────────────────────────────────────────────

export type RunEvent =
  | { type: 'run'; runId: string; brief: SearchBrief }
  | { type: 'status'; message: string; found?: number; researched?: number }
  | { type: 'card'; card: MatchCard }
  | { type: 'done'; runId: string; stats: RunStats }
  | { type: 'error'; message: string };

// ──────────────────────────────────────────────────────────────────────────
// Handoff (Gmail draft → Lightfern Chrome extension)
// ──────────────────────────────────────────────────────────────────────────

/** Sender context collected progressively before the first handoff. */
export interface SenderContext {
  name?: string;
  company?: string;
  role?: string;
  whatYouDo?: string;
  goal?: string;
  /** The Gmail account the draft belongs to / is sent from. */
  fromEmail?: string;
}

export interface HandoffRequest {
  runId?: string;
  cardId?: string;
  /** The research packet to turn into a draft. */
  packet: MatchCard;
  sender?: SenderContext;
}

export type HandoffMode = 'gmail_draft' | 'compose_link' | 'mock';

export interface HandoffResult {
  mode: HandoffMode;
  /** Gmail draft id, when a real draft was created. */
  draftId?: string;
  /** A URL the frontend can open: Gmail draft URL or compose deep-link. */
  gmailUrl?: string;
  to?: string;
  subject: string;
  body: string;
  /** Human-readable status for the UI. */
  message: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Provider interfaces (implemented per module)
// ──────────────────────────────────────────────────────────────────────────

/** Search/data layer — Unify live or mock. (Agent 1) */
export interface SearchProvider {
  readonly name: 'unify' | 'mock';
  /** Find candidate people/businesses for a brief. */
  search(brief: SearchBrief): Promise<Candidate[]>;
  /** Add contact + firmographic detail and source links to one candidate. */
  enrich(candidate: Candidate, brief: SearchBrief): Promise<EnrichedCandidate>;
}

/** LLM layer — Gemini live or mock. (Agent 2) */
export interface LLMProvider {
  readonly name: 'gemini' | 'mock';
  /** Generate strict JSON; `schemaHint` is appended to the prompt. */
  generateJson<T = unknown>(prompt: string, schemaHint?: string): Promise<T>;
  generateText(prompt: string): Promise<string>;
}

/** Brief layer — conversation → structured brief. (Agent 2) */
export interface BriefService {
  build(input: ConversationInput): Promise<SearchBrief>;
}

/** Research layer — enriched candidate → grounded notes. (Agent 2) */
export interface ResearchService {
  analyze(candidate: EnrichedCandidate, brief: SearchBrief): Promise<ResearchNotes>;
}

/** Handoff layer — research packet → Gmail draft / compose link. (Agent 3) */
export interface HandoffService {
  handoff(req: HandoffRequest): Promise<HandoffResult>;
}

/** Run persistence — in-memory now, swappable later. (Agent 4) */
export interface RunStore {
  create(brief: SearchBrief): RunState;
  get(id: string): RunState | undefined;
  update(id: string, patch: Partial<RunState>): RunState | undefined;
  addCard(id: string, card: MatchCard): RunState | undefined;
}
