# 4 Parallel Agent Prompts — Lightfern Reach backend

**Context for all agents:** A runnable, mock-first backend already exists at `/Users/ammad/GTMhack/backend` (Node + TypeScript + Fastify). The shared contract is **frozen in `src/types.ts`** — implement its interfaces; do **not** edit `types.ts` or `config.ts` without flagging it. Each prompt below owns a non-overlapping set of files. Don't run `git` or edit the frontend (repo root `index.html`/`styles.css`/`script.js`). Read `backend/API-CONTRACT.md` and `backend/README.md` first.

Run all four in parallel.

---

## Agent 1 — Make Unify search live + robust

You own the search/data layer in `backend/src/providers/search/` (`unify.ts`, `mock.ts`, `fixtures.ts`, `index.ts`). A scaffold + mock already exist. Goal: wire the **real Unify API** and make it production-grade while keeping mock as fallback.

- We have a Unify API key (it will be in `.env` as `UNIFY_API_KEY`, base `UNIFY_API_BASE_URL`). Implement the real flow in `unify.ts`: standardize filters via `autocomplete`, search via `fetch-entities` (`entity_type` = `prospects` for people, `businesses` for companies), then `enrich-prospects` (contacts/profiles) / `enrich-business` (firmographics/funding) for detail + sources. **Verify the exact endpoint paths and response field names against the live API** and fix the `// TODO(unify-api)` spots — make one real call per endpoint and adjust the mapping to what actually comes back.
- Map `SearchBrief.filters` (`UnifyFilters`) → the API's filter payload completely (job_title/level/department, company_size/revenue/country/region, city_region, linkedin_category, naics_category, website_keywords, business_intent_topics, company_age, has_email).
- Add: timeouts, a couple of retries with backoff on 429/5xx, and clear errors. The `index.ts` resilient wrapper must fall back to mock on live failure so the demo never breaks.
- Expand `fixtures.ts` so each of the 4 target types (investors, customers, startups, local_businesses) has 8–10 specific, realistic London/UK entries with enough `fields` for grounded notes + 2–3 source URLs each.
- Add `backend/test/search.test.ts` (vitest): mock-provider returns results per target type; brief filters narrow results; `enrich` always yields contact + sources.

**Done when:** a real Unify search returns mapped `Candidate[]` and `enrich` returns `EnrichedCandidate` with email + sources; mock fallback verified; `npm run typecheck` and `npm test` pass.

---

## Agent 2 — Gemini brief + research quality

You own `backend/src/providers/llm/` (`gemini.ts`, `mock.ts`, `index.ts`) and `backend/src/services/` (`brief.ts`, `research.ts`). Scaffold exists. Goal: high-quality, grounded Gemini output with bulletproof deterministic fallbacks.

- `GeminiProvider.generateJson` must be robust: low temperature, strip code fences, `JSON.parse`, one retry on bad JSON, then throw. Honour `GEMINI_API_KEY` / `GEMINI_MODEL` from config. Add a request timeout.
- `brief.ts`: tune the Gemini prompt so messy input → a clean `SearchBrief` (correct `targetType` inference, `entity`, mapped `UnifyFilters`, ISO country codes, human-readable lines, and `needs_clarification` only when genuinely missing — always ask for `goal` if absent). Validate Gemini's output and fall back to the deterministic parser on any error.
- `research.ts`: tune the prompt so notes are **grounded only in the candidate's `enrichment`/`fields`/`sources`** — no invented deals, dates, or names. Thin data → `confidence: 'low'` + honest generic notes. `suggested_angle` must reference `brief.goal`. Deterministic fallback stays specific to each candidate.
- Add an anti-hallucination guard: drop/repair any `notes` item that asserts a specific fact not present in the provided candidate data.
- Add `backend/test/research.test.ts` + `backend/test/brief.test.ts` (vitest, mock LLM): brief infers all 4 target types; clarifying question appears when goal missing; research notes never exceed the provided facts.

**Done when:** with a real key, briefs and notes are clean and grounded; with no key, deterministic output is solid; `npm run typecheck` and `npm test` pass.

---

## Agent 3 — Gmail draft handoff (real OAuth) + Lightfern demo flow

You own `backend/src/handoff/` (`packet.ts`, `gmail.ts`, `index.ts`). Scaffold exists. Goal: create a **real Gmail draft** from a research packet, with a no-auth compose-link fallback, plus the demo runbook.

- Implement `GmailClient.createDraft` end-to-end with `googleapis` OAuth2 (`GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/SENDER`): build a base64url MIME message and call `gmail.users.drafts.create`; return `draftId` + a Gmail URL that opens the draft. Verify it against a real test Gmail account.
- Write `backend/scripts/gmail-oauth.ts` — a tiny one-time CLI that walks through Google OAuth (scope `https://www.googleapis.com/auth/gmail.compose`) and prints a `GMAIL_REFRESH_TOKEN`. Document setup in `backend/docs/gmail-setup.md` (create OAuth client in Google Cloud, consent screen, run the script).
- Polish `buildEmailFromPacket`: warm, specific, ~120–160 word **starting draft** grounded in the packet (greeting, why-reaching-out from `why_match`+`suggested_angle`+sender context, 1–2 grounded note lines, soft ask, sign-off). It's a context starter — Lightfern refines it. No fabrication.
- Ensure `index.ts` returns `gmail_draft` on success, `compose_link` on failure/when unconfigured (must never throw), `mock` as last resort — always with `subject`/`body`.
- Add `backend/test/handoff.test.ts`: compose-link is correctly URL-encoded; service falls back without OAuth; email body contains packet specifics.
- In `backend/docs/gmail-setup.md`, document the demo: handoff → open `gmailUrl` → Lightfern Chrome extension drafts/sends in Gmail.

**Done when:** a real draft appears in the test account's Drafts; fallback verified; `npm run typecheck` and `npm test` pass.

---

## Agent 4 — End-to-end tests, deployment, persistence, frontend client

You own `backend/test/` (integration), deploy config, and **may add** `backend/src/store/supabaseStore.ts` (don't modify other src files except wiring in `container.ts` behind an env flag — coordinate before touching `container.ts`).

- **E2E tests** (`backend/test/e2e.test.ts`, vitest against `buildServer()`): `POST /api/brief` returns a valid brief; `POST /api/run` streams `run`→`status`→`card`(≥1)→`done` in mock mode; `GET /api/run/:id` returns the run; `POST /api/lightfern/handoff` returns a `compose_link` result with `gmailUrl`. Parse the SSE stream in the test.
- **Frontend client:** `backend/client/lightfernClient.ts` — a tiny typed client (`buildBrief`, `streamRun(onCard,onStatus,onDone)`, `getRun`, `handoff`) the frontend can import, matching `API-CONTRACT.md`. Include a runnable `backend/client/example.html` that hits a local server for smoke-testing the stream.
- **Persistence (optional, behind flag):** implement `SupabaseRunStore implements RunStore` using the Supabase JS client + a `runs` table migration in `backend/supabase/`. Wire it in `container.ts` only when `SUPABASE_URL`/`SUPABASE_KEY` are set; default stays in-memory.
- **Deploy:** add a `Dockerfile`, a `backend/render.yaml` **or** `railway.json` (pick one), and `backend/docs/deploy.md`. Ensure `npm run build` (tsc) emits `dist/` cleanly and `node dist/index.js` boots.
- Add a `backend/scripts/smoke.sh` that curls `/api/health`, `/api/brief`, and runs one streamed `/api/run`.

**Done when:** `npm test` passes the E2E suite in mock mode, the frontend client streams cards in `example.html`, and `docs/deploy.md` describes a one-command deploy.
