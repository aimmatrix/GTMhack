/**
 * UnifySearchProvider — live search/data layer over the Explorium B2B
 * Partner API (Unify GTM prospecting uses the same contract).
 *
 * Flow:
 *   1. autocomplete — GET /prospects/autocomplete or /businesses/autocomplete
 *                     to standardize categorical filter values.
 *   2. fetch          — POST /prospects or /businesses with mapped filters.
 *   3. enrich         — POST /prospects/contacts_information/enrich +
 *                       /prospects/profiles/enrich (people), or
 *                       /businesses/firmographics/enrich +
 *                       /businesses/funding_and_acquisition/enrich (companies).
 *
 * If UNIFY_API_BASE_URL points at the Unify CRM Data API
 * (api.unifygtm.com/data/v1) we automatically target the Explorium B2B base
 * instead — that host only exposes object/record CRUD, not prospect search.
 *
 * On ANY failure we throw — index.ts falls back to the mock provider.
 */
import { config } from '../../config';
import type {
  Candidate,
  EnrichedCandidate,
  EntityKind,
  SearchBrief,
  SearchProvider,
  SourceLink,
  UnifyFilters,
} from '../../types';
import { logger } from '../../utils/logger';

const log = logger('search');

/** Explorium entity routing — people → prospects, companies → businesses. */
type UnifyEntityType = 'prospects' | 'businesses';

type UnifyRow = Record<string, unknown>;

/** Autocomplete field names accepted by Explorium (shared across entity types). */
type AutocompleteField =
  | 'job_title'
  | 'job_level'
  | 'job_department'
  | 'linkedin_category'
  | 'naics_category'
  | 'business_intent_topics'
  | 'company_tech_stack_tech'
  | 'city_region'
  | 'company_size'
  | 'company_revenue'
  | 'company_age'
  | 'country_code';

type AutoCompleteItem = { query?: string; label?: string; value?: string };

const EXPLORIUM_B2B_BASE = 'https://api.explorium.ai/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** CRM Data API host — not usable for B2B prospect search. */
function isCrmDataBase(url: string): boolean {
  return /unifygtm\.com\/data/i.test(url);
}

/** Resolve the B2B API base URL from config. */
export function resolveB2bBaseUrl(configured: string): string {
  const trimmed = configured.replace(/\/+$/, '');
  if (!trimmed || isCrmDataBase(trimmed)) {
    if (trimmed && isCrmDataBase(trimmed)) {
      log.info('UNIFY_API_BASE_URL is the CRM Data API — using Explorium B2B base for search');
    }
    return EXPLORIUM_B2B_BASE;
  }
  return trimmed;
}

export class UnifySearchProvider implements SearchProvider {
  readonly name = 'unify' as const;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = resolveB2bBaseUrl(config.search.baseUrl);
    this.apiKey = config.search.apiKey;
  }

  async search(brief: SearchBrief): Promise<Candidate[]> {
    if (!this.apiKey) throw new Error('Unify search: missing UNIFY_API_KEY');

    const entityType: UnifyEntityType = brief.entity === 'people' ? 'prospects' : 'businesses';
    const standardized = await this.standardizeFilters(brief.filters, entityType);
    const mapped = this.mapFilters(standardized, entityType);
    // Explorium ignores a country-only business filter (it returns US mega-caps),
    // so businesses must carry a company_size companion for geography to apply.
    // Size also encodes intent: local/startup = small.
    if (entityType === 'businesses' && !('company_size' in mapped)) {
      const sizes =
        brief.targetType === 'local_businesses'
          ? ['1-10', '11-50']
          : brief.targetType === 'startups'
            ? ['1-10', '11-50', '51-200']
            : ['11-50', '51-200', '201-500', '501-1000'];
      mapped.company_size = { values: sizes };
    }
    const rows = await this.fetchWithRelax(entityType, mapped, brief.max_results);
    const candidates = rows
      .slice(0, brief.max_results)
      .map((row) => this.mapRowToCandidate(row, brief.entity));

    log.info(`unify.search entity=${entityType} -> ${candidates.length} candidates`);
    return candidates;
  }

  async enrich(candidate: Candidate, _brief: SearchBrief): Promise<EnrichedCandidate> {
    if (!this.apiKey) throw new Error('Unify enrich: missing UNIFY_API_KEY');

    const raw =
      candidate.entity === 'people'
        ? await this.enrichProspect(candidate)
        : await this.enrichBusiness(candidate);

    return this.mapEnrichment(candidate, raw);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HTTP plumbing
  // ────────────────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      api_key: this.apiKey,
    };
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  /** GET with timeout + retry on 429/5xx. */
  private async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
    const qs = query
      ? `?${new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][],
        )}`
      : '';
    return this.request<T>('GET', `${path}${qs}`);
  }

  /** POST with timeout + retry on 429/5xx. */
  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = 400 * 2 ** (attempt - 1);
        log.warn(`unify retry ${attempt}/${MAX_RETRIES} for ${path} after ${backoff}ms`);
        await this.sleep(backoff);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method,
          headers: this.headers(),
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(
            `Unify ${path} returned ${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
          );
          if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
            lastError = err;
            continue;
          }
          throw err;
        }

        return (await res.json()) as T;
      } catch (err) {
        const e = err as Error;
        if (e.name === 'AbortError') {
          lastError = new Error(`Unify request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
        } else if (e.message.startsWith('Unify ')) {
          lastError = e;
        } else {
          lastError = new Error(`Unify request to ${path} failed (network): ${e.message}`);
        }

        const status = Number.parseInt(e.message.match(/returned (\d+)/)?.[1] ?? '0', 10);
        const retryable = e.name === 'AbortError' || RETRYABLE_STATUSES.has(status);
        if (retryable && attempt < MAX_RETRIES) continue;
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error(`Unify ${path} failed after retries`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 1 — autocomplete
  // ────────────────────────────────────────────────────────────────────────

  private async standardizeFilters(
    filters: UnifyFilters,
    entityType: UnifyEntityType,
  ): Promise<UnifyFilters> {
    const out: UnifyFilters = { ...filters };

    // ONLY these fields support Explorium autocomplete. Autocompleting anything
    // else (country_code, company_size/revenue/age, job_level/department)
    // returns junk or 400s — e.g. it was replacing "GB" with "" and 422-ing the
    // whole search. `strict` fields are validated by the API, so if autocomplete
    // yields no match we DROP the value rather than send an invalid one.
    const lookups: {
      key: keyof UnifyFilters;
      field: AutocompleteField;
      semantic?: boolean;
      strict?: boolean;
    }[] = [
      { key: 'job_title', field: 'job_title' },
      { key: 'linkedin_category', field: 'linkedin_category', strict: true },
      { key: 'naics_category', field: 'naics_category', strict: true },
      { key: 'company_tech_stack_tech', field: 'company_tech_stack_tech', strict: true },
      { key: 'city_region', field: 'city_region', strict: true },
      { key: 'business_intent_topics', field: 'business_intent_topics', semantic: true, strict: true },
    ];

    for (const { key, field, semantic, strict } of lookups) {
      const values = filters[key];
      if (!Array.isArray(values) || values.length === 0) continue;
      try {
        const standardized: string[] = [];
        for (const q of values) {
          const matches = await this.autocomplete(entityType, field, String(q), semantic);
          if (matches.length) standardized.push(...matches);
          else if (!strict) standardized.push(String(q));
          // strict + no match → drop this value entirely
        }
        const cleaned = Array.from(
          new Set(standardized.map((s) => s.trim()).filter((s) => s.length > 0)),
        );
        if (cleaned.length) (out[key] as string[]) = cleaned;
        else delete out[key];
      } catch (err) {
        log.warn(`unify.autocomplete failed for ${field}`, err);
        if (strict) delete out[key];
        else (out[key] as string[]) = values;
      }
    }

    return out;
  }

  /** GET /{entityType}/autocomplete — returns standardized string values. */
  private async autocomplete(
    entityType: UnifyEntityType,
    field: AutocompleteField,
    query: string,
    semanticSearch = false,
  ): Promise<string[]> {
    const queryParams: Record<string, string> = { field, query };
    if (semanticSearch) queryParams.semantic_search = 'true';

    const data = await this.get<AutoCompleteItem[]>(
      `/${entityType}/autocomplete`,
      queryParams,
    );

    const items = Array.isArray(data) ? data : [];
    return items
      .map((r) => r.value ?? r.label)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 2 — fetch
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Fetch entities, broadening on empty. Briefs often AND together several
   * filters (size + industry + website keywords + buying intent) whose
   * intersection is empty even though each alone has matches. Rather than show
   * an empty dashboard, drop the most optional filters one at a time and retry.
   */
  private async fetchWithRelax(
    entityType: UnifyEntityType,
    mapped: Record<string, unknown>,
    maxResults: number,
  ): Promise<UnifyRow[]> {
    // Most-optional first; core firmographics (country, size, revenue, titles)
    // are never dropped.
    const dropOrder = [
      'business_intent_topics',
      'website_keywords',
      'company_tech_stack_tech',
      'city_region',
      'linkedin_category',
      'naics_category',
      'job_title',
    ];
    const current = { ...mapped };
    let rows = await this.fetchPage(entityType, current, maxResults);

    for (const key of dropOrder) {
      if (rows.length > 0) break;
      if (!(key in current)) continue;
      delete current[key];
      log.info(`unify: 0 results — relaxing '${key}' and retrying`);
      rows = await this.fetchPage(entityType, current, maxResults);
    }
    return rows;
  }

  private async fetchPage(
    entityType: UnifyEntityType,
    mappedFilters: Record<string, unknown>,
    maxResults: number,
  ): Promise<UnifyRow[]> {
    const pageSize = Math.min(Math.max(maxResults, 1), 100);
    const body = {
      mode: 'preview' as const,
      size: maxResults,
      page_size: pageSize,
      page: 1,
      filters: mappedFilters,
    };

    const data = await this.post<{ data?: UnifyRow[] }>(`/${entityType}`, body);
    return data.data ?? [];
  }

  /**
   * Map `UnifyFilters` → Explorium `filters` object.
   * Includes-filters use `{ values: [...] }`; booleans use `{ value: true }`.
   */
  private mapFilters(filters: UnifyFilters, entityType: UnifyEntityType): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    // Wrap as { values: [...] }, dropping blanks. Only country/region codes are
    // lowercased — Explorium wants ISO codes lowercase ("gb"), but enum values
    // like "11-50" or "1M-5M" must keep their original case or the filter 422s.
    const wrap = (key: string, values?: string[], lower = false) => {
      const clean = (values ?? [])
        .map((v) => {
          const t = String(v).trim();
          return lower ? t.toLowerCase() : t;
        })
        .filter((v) => v.length > 0);
      if (clean.length > 0) out[key] = { values: clean };
    };

    if (entityType === 'prospects') {
      wrap('job_title', filters.job_title);
      wrap('job_level', filters.job_level);
      wrap('job_department', filters.job_department);
      wrap('country_code', filters.prospect_country_code, true);
      wrap('region_country_code', filters.prospect_region_country_code, true);
      if (filters.has_email === true) out.has_email = { value: true };

      wrap('company_size', filters.company_size);
      wrap('company_revenue', filters.company_revenue);
      wrap('company_country_code', filters.company_country_code, true);
      wrap('company_region_country_code', filters.company_region_country_code, true);
      wrap('city_region', filters.city_region);
      wrap('company_tech_stack_tech', filters.company_tech_stack_tech);
      wrap('website_keywords', filters.website_keywords);
      wrap('company_age', filters.company_age);
    } else {
      wrap('country_code', filters.company_country_code, true);
      wrap('region_country_code', filters.company_region_country_code, true);
      wrap('company_size', filters.company_size);
      wrap('company_revenue', filters.company_revenue);
      wrap('city_region', filters.city_region);
      wrap('company_tech_stack_tech', filters.company_tech_stack_tech);
      wrap('website_keywords', filters.website_keywords);
      wrap('company_age', filters.company_age);
    }

    // Industry: Explorium accepts only ONE of linkedin_category / naics_category
    // per request. Prefer LinkedIn category, fall back to NAICS.
    if (Array.isArray(filters.linkedin_category) && filters.linkedin_category.length > 0) {
      wrap('linkedin_category', filters.linkedin_category);
    } else if (Array.isArray(filters.naics_category) && filters.naics_category.length > 0) {
      wrap('naics_category', filters.naics_category);
    }

    if (Array.isArray(filters.business_intent_topics) && filters.business_intent_topics.length > 0) {
      out.business_intent_topics = { topics: filters.business_intent_topics };
    }

    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Step 3 — enrichment
  // ────────────────────────────────────────────────────────────────────────

  private async enrichProspect(candidate: Candidate): Promise<UnifyRow> {
    const prospectId = this.entityId(candidate, 'prospect_id');
    if (!prospectId) {
      throw new Error('Unify enrich-prospect: missing prospect_id on candidate');
    }

    // Contacts only (email/phone). The separate profiles enrichment is a second
    // billable call we don't need — the fetch row already carries experience /
    // skills for grounding notes. Halves credit use per prospect.
    const contacts = await this.post<{ data?: UnifyRow | UnifyRow[] }>(
      '/prospects/contacts_information/enrich',
      { prospect_id: prospectId, parameters: { contact_types: ['email', 'phone'] } },
    );

    return this.unwrapEnrichment(contacts);
  }

  private async enrichBusiness(candidate: Candidate): Promise<UnifyRow> {
    const businessId = this.entityId(candidate, 'business_id');
    if (!businessId) {
      throw new Error('Unify enrich-business: missing business_id on candidate');
    }

    // Firmographics only — drop the separate funding_and_acquisition call to
    // halve credit use. The fetch row already carries description / size /
    // location for grounding notes.
    const firmographics = await this.post<{ data?: UnifyRow | UnifyRow[] }>(
      '/businesses/firmographics/enrich',
      { business_id: businessId },
    );

    return this.unwrapEnrichment(firmographics);
  }

  private unwrapEnrichment(payload: { data?: UnifyRow | UnifyRow[] }): UnifyRow {
    const d = payload.data;
    if (Array.isArray(d)) return d[0] ?? {};
    if (d && typeof d === 'object') return d;
    return {};
  }

  private entityId(candidate: Candidate, field: 'prospect_id' | 'business_id'): string | undefined {
    const fromFields = candidate.fields?.[field];
    if (typeof fromFields === 'string' && fromFields.length > 0) return fromFields;
    if (candidate.id && !candidate.id.startsWith('unify-') && !candidate.id.startsWith('mock-')) {
      return candidate.id;
    }
    return undefined;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Row → contract mapping
  // ────────────────────────────────────────────────────────────────────────

  private mapRowToCandidate(row: UnifyRow, entity: EntityKind): Candidate {
    const pick = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = row[k];
        if (typeof v === 'string' && v.trim()) return v;
      }
      return undefined;
    };

    const composedName = [pick('first_name'), pick('last_name')].filter(Boolean).join(' ').trim();
    const name =
      pick('full_name', 'name', 'company_name', 'business_name') ??
      (composedName.length > 0 ? composedName : 'Unknown');

    const company = pick('company_name', 'company', 'organization', 'business_name', 'name');
    const domain = pick('company_website', 'website', 'domain', 'company_domain');
    const linkedinRaw = pick('linkedin', 'linkedin_url', 'linkedin_profile', 'professional_network_url');
    const linkedin = linkedinRaw ? this.normalizeUrl(linkedinRaw) : undefined;
    const url = pick('website', 'company_website', 'url') ?? (domain ? `https://${domain}` : undefined);

    const locationParts = [pick('city', 'city_name'), pick('region_name'), pick('country_name', 'location')]
      .filter(Boolean);
    const location = locationParts.length > 0 ? locationParts.join(', ') : pick('location');

    const id =
      pick('prospect_id', 'business_id', 'id') ??
      `unify-${Math.random().toString(36).slice(2, 10)}`;

    return {
      id,
      entity,
      name,
      company,
      role: pick('job_title', 'title', 'role'),
      location,
      url: url ? this.normalizeUrl(url) : undefined,
      linkedin,
      domain: domain?.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      source: 'unify',
      fields: row,
    };
  }

  private mapEnrichment(candidate: Candidate, raw: UnifyRow): EnrichedCandidate {
    const email =
      this.pickString(raw, 'professions_email', 'professional_email', 'email', 'work_email') ??
      this.firstEmail(raw.emails);

    const phone =
      this.pickString(raw, 'mobile_phone', 'phone', 'phone_number', 'company_phone') ??
      this.firstPhone(raw.phone_numbers);

    const sources: SourceLink[] = [];
    const addSource = (title: string, value?: string) => {
      if (!value) return;
      sources.push({ title, url: this.normalizeUrl(value) });
    };

    addSource(`${candidate.company || candidate.name} — website`, candidate.url);
    addSource(
      `${candidate.name} on LinkedIn`,
      candidate.linkedin ?? this.pickString(raw, 'linkedin', 'linkedin_profile'),
    );
    addSource('Company LinkedIn', this.pickString(raw, 'company_linkedin', 'linkedin_profile'));
    addSource('Source', this.pickString(raw, 'source_url', 'profile_url', 'website'));

    if (sources.length === 0 && candidate.domain) {
      sources.push({ title: candidate.name, url: `https://${candidate.domain}` });
    }

    return {
      ...candidate,
      email,
      phone,
      enrichment: { ...(candidate.fields ?? {}), ...raw },
      sources: sources.slice(0, 3),
    };
  }

  private pickString(obj: UnifyRow, ...keys: string[]): string | undefined {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v;
    }
    return undefined;
  }

  private firstEmail(emails: unknown): string | undefined {
    if (!Array.isArray(emails) || emails.length === 0) return undefined;
    const first = emails[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const o = first as Record<string, unknown>;
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && v.includes('@')) return v;
      }
    }
    return undefined;
  }

  private firstPhone(phones: unknown): string | undefined {
    if (!Array.isArray(phones) || phones.length === 0) return undefined;
    const first = phones[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      const o = first as Record<string, unknown>;
      for (const v of Object.values(o)) {
        if (typeof v === 'string' && /\+?\d/.test(v)) return v;
      }
    }
    return undefined;
  }

  private normalizeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.includes('linkedin.com') || url.startsWith('linkedin.com')) {
      return `https://${url.replace(/^\/\//, '')}`;
    }
    return `https://${url.replace(/^\/\//, '')}`;
  }
}
