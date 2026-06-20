# PRD — Lightfern Reach

**Working title:** Lightfern Reach (rename freely)
**One-liner:** A web app where you describe what you're looking for — an ideal customer, investor, startup, or local business — and it searches the web to find matching people/businesses, uses AI to generate notes and a tailored angle, feeds that into Lightfern's auto-completion, then writes and sends a recommendation email **in your own voice**.
**Author:** Ammad
**Date:** 2026-06-20
**Status:** Draft v3 — web app (pivoted from the Chrome-extension concept; Personality / Voice feature kept as the differentiator)
**For:** Lightfern GTM Hackathon (London, by Cursor × GTMengineer.dev × Lightfern)
**Note:** Delivered as a hosted web application (sign in, run, review, send — all in the browser, no install). Council-flagged risks (auto-send / Tavily-as-matcher) are recorded in §12 with light hackathon mitigations, but the core flow is kept as originally designed.

---

## 1. Concept

You open the app, type what you're looking for, and Lightfern Reach finds it, researches it, drafts a personalized email, and sends it — all from one screen. The differentiator is the **Personality / Voice Profile**: every email is written in *your* tone, not the generic ChatGPT register.

**The flow:**
```
Input (what you're looking for)
   → Tavily search finds matching people / businesses
   → AI (Gemini/OpenAI) summarizes + generates notes, basic info, and an angle/idea
   → notes fed into Lightfern auto-completion (completes the record + assists drafting)
   → AI generates the recommendation email — IN YOUR VOICE (Voice Profile)
   → email is sent to the matched person
```

Delivering this as a web app (rather than a browser extension) removes install/sideload friction, gives us a real screen for the results dashboard and Voice Profile editor, and lets the whole multi-step pipeline run server-side without the Manifest V3 service-worker time limit.

---

## 2. Goals & non-goals

### Goals
- G1 — From a free-text description, find people/businesses that match across the four input types (customer / investor / startup / local business).
- G2 — Generate useful notes + basic info + a tailored angle for each match via AI.
- G3 — Run those notes through Lightfern auto-completion to complete the record and assist email drafting.
- G4 — Draft and send a recommendation email per match, written in the user's own voice (Voice Profile).
- G5 — Demo the full arc — input → match → notes → Lightfern completion → voiced email → sent — end to end, live in the browser.

### Non-goals (hackathon)
- NG1 — Multi-touch sequencing / drip campaigns / A/B testing.
- NG2 — Building our own contact database (Tavily + Lightfern supply discovery/completion).
- NG3 — Deliverability infrastructure (domain warming, SPF/DKIM/DMARC) — we send through the user's own Gmail.
- NG4 — CRM sync, team accounts, analytics dashboards.
- NG5 — Native mobile apps (the web app is responsive; mobile-native is out of scope).

---

## 3. Target users & the four input types

The product accepts any of four "what are you looking for" modes; the pipeline is the same, the prompt framing differs:

| Input type | Example query | Who's searching | Email goal |
|---|---|---|---|
| **Ideal customer** | "Heads of Ops at UK 3PL / freight firms, 50–500 staff" | Founder / SDR doing outbound | Pitch / book a call |
| **Investor** | "Pre-seed investors backing vertical SaaS in logistics, £100k–£500k, UK/EU" | Founder raising a round | Warm intro / pitch |
| **Startup** | "Seed-stage AI compliance startups in London" | BD / partnerships / competitor scout | Partnership / collab |
| **Local business** | "Independent coffee shops in Shoreditch without a modern website" | Agency / freelancer | Service pitch |

Primary persona is the **solo / early-stage founder or operator** who lives in the browser + Gmail, has no enterprise sales stack, and needs a small number of high-quality, personalized emails.

---

## 4. Core user flow

```
First run (one-time):
  1. Sign in (Google sign-in; same account used for Gmail send).
  2. Create your Voice Profile (Personality) → done.

Every run:
  1. Open the app → pick input type → type what you're looking for
  2. Tavily search → returns candidate people / businesses matching the criteria
  3. AI (Gemini/OpenAI) → per match: summary, basic info, a tailored angle/idea
  4. Lightfern auto-completion → completes the record + assists drafting
  5. AI → generates the recommendation email, written in the selected Voice Profile
  6. Email is sent to the matched person (see §12 for the review-vs-auto-send toggle)
```

The results dashboard renders one card per match and streams them in as the pipeline finishes each, so the user sees progress instead of a spinner.

---

## 5. ★ Feature spec: Personality / Voice Profile

> The kept feature: a saved "Personality" so the AI writes the email in the user's tone, not a generic one. This is the product's differentiator.

### 5.1 What it is
A reusable, structured description of how the user writes, captured once and applied to every generated email. The user can keep more than one (e.g. "Investor voice" vs "Sales voice") and pick which to use per run.

### 5.2 How the user creates it (setup UX)
On first run (editable anytime in Settings), via three lightweight inputs:

1. **About me** (free text) — name, role, company, what they do, one-line value prop, a sign-off they like. Grounds *what* the email says.
2. **Tone dials** (5 sliders, 1–5) — fast, visual, no writing required:
   - **Formality** — casual ↔ formal
   - **Warmth** — direct/transactional ↔ warm/personal
   - **Length** — terse (≤60 words) ↔ detailed (≤150 words)
   - **Energy** — calm/measured ↔ enthusiastic
   - **Playfulness** — straight ↔ witty
3. **Sound like me** (optional, the magic step) — paste 1–3 emails the user actually wrote. The LLM extracts observable style markers (avg sentence length, formality, emoji/exclamation use, greeting + sign-off patterns, favored phrases, contractions). Pre-fills/overrides the dials.

Presets ("Founder-to-founder", "Polished professional", "Warm & brief") set the dials in one click.

### 5.3 Data model (`VoiceProfile`)
```json
{
  "id": "vp_default",
  "label": "Investor voice",
  "sender": {
    "name": "Ammad",
    "role": "Founder",
    "company": "Acme",
    "value_prop": "We help logistics SaaS cut onboarding time by 40%.",
    "signoff": "Cheers,\nAmmad"
  },
  "tone": { "formality": 2, "warmth": 4, "length": 2, "energy": 3, "playfulness": 3 },
  "style_markers": {
    "avg_sentence_words": 14,
    "uses_contractions": true,
    "emoji": "rare",
    "exclamations": "rare",
    "greeting_pattern": "Hi {firstName},",
    "signature_phrases": ["quick one", "worth a chat?"]
  },
  "hard_rules": ["No buzzwords", "Never more than 130 words", "One clear CTA"]
}
```

### 5.4 How it shapes the email (prompt injection)
The Voice Profile is rendered into the LLM style instruction at generation time, alongside the AI notes, Lightfern-completed record, and the match's basic info:

```
SYSTEM: You write outreach emails as a specific person. Match their voice exactly.
VOICE PROFILE: {rendered VoiceProfile — sender facts, tone dials as adjectives, style markers, hard_rules}
RECIPIENT: {Lightfern-completed record + AI notes + tailored angle}
TASK: Write a {length-from-tone}-word email. Lead with the tailored angle. One clear CTA.
      Use the greeting + sign-off patterns. Obey every hard_rule. Output subject + body only.
```

### 5.5 Acceptance criteria
- AC1 — Create, name, edit, delete a Voice Profile; it persists across sessions.
- AC2 — Two different profiles on the **same** match produce visibly different drafts (tone, length, greeting/sign-off).
- AC3 — "Sound like me" pasted samples measurably shift output (shorter sentences, contractions on) vs the default preset.
- AC4 — Every `hard_rule` (word cap, "no buzzwords", etc.) is respected.
- AC5 — The draft uses the AI-generated angle/notes; it doesn't invent facts not present in the notes.

### 5.6 Stretch
- Learn from edits: diff the user's edited draft against the generated one and nudge style markers over time.

---

## 6. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Input** — input-type picker (customer / investor / startup / local business) + free-text box. | P0 |
| F2 | **Search (Tavily)** — find candidate people/businesses matching the criteria; return N candidates with source links. | P0 |
| F3 | **Notes (LLM)** — per match: summary, basic info, and a tailored angle/idea. | P0 |
| F4 | **Lightfern auto-completion** — feed notes/record into Lightfern to complete the record + assist drafting. | P0 |
| F5 | **Voice Profile** — §5. | P0 |
| F6 | **Email generation (LLM)** — subject + body, written in the selected Voice Profile. | P0 |
| F7 | **Send** — send the email to the matched person (via the user's Gmail). See §12 toggle. | P0 |
| F8 | **Results dashboard** — list of match cards: basic info, notes, source links, the generated email; streams in as each match finishes. | P0 |
| F9 | **Empty/low-confidence state** — honest "no strong matches" rather than padded results. | P1 |
| F10 | **Compliance footer** — sender identity + opt-out line appended on send. | P1 |
| F11 | **Multiple Voice Profiles + per-run picker.** | P1 |
| F12 | **Auth** — Google sign-in; gates the app and provides the Gmail send scope. | P1 |

---

## 7. Architecture

```
┌──────────────────────────┐     ┌──────────────────────────────┐     ┌────────────────┐
│  Web frontend            │     │  Backend / API routes         │     │  External APIs  │
│  (Next.js + React)       │────▶│  - holds all API keys         │────▶│  Tavily (search)│
│  - input + type picker   │     │  - orchestrates the pipeline  │     │  Gemini/OpenAI  │
│  - Voice Profile editor  │     │  - search → notes → Lightfern │     │  Lightfern      │
│  - results dashboard     │◀────│    → email (streamed)         │     │  Gmail API      │
│  - send button           │     │  - stores VoiceProfiles+auth  │     └────────────────┘
└──────────────────────────┘     └──────────────────────────────┘
        single deployable (frontend + API in one Next.js app)
```

**Why a server-side pipeline:** keeps API keys off the client, and runs the multi-call pipeline (search → notes → Lightfern → email) in one place with retries, per-call timeouts, and streaming — so one failed match doesn't kill the batch, and the user sees cards appear as they complete. Because it's a normal web server (not an MV3 service worker), there's no ~30s execution cap to design around.

### 7.1 Recommended stack (hackathon-fast)
- **Frontend + backend:** Next.js (App Router) — React UI + API route handlers in one app, deployed to Vercel.
- **API routes:** `/api/run`, `/api/voice-profiles`, `/api/extract-voice`, `/api/send`.
- **LLM:** Gemini Flash or GPT-4o-mini class (cheap, fast) — optionally via the Vercel AI SDK / AI Gateway for streaming + provider fallback.
- **Storage:** Postgres (Vercel Marketplace) or a lightweight KV for Voice Profiles + sessions; browser `localStorage` is acceptable for the MVP.
- **Auth + send:** Google sign-in (NextAuth/Auth.js) with a Gmail send scope; send via the Gmail API.

### 7.2 Endpoints
- `POST /api/run` — `{ inputType, query, voiceProfileId }` → streams match cards (search → notes → Lightfern complete → email) as each finishes.
- `GET/POST/PUT/DELETE /api/voice-profiles` — CRUD for Personalities.
- `POST /api/extract-voice` — `{ sampleEmails[] }` → inferred `style_markers` + dial suggestions.
- `POST /api/send` — `{ matchId, subject, body }` → sends via the user's Gmail.

---

## 8. Non-functional requirements

- **Security:** No API key reaches the browser; all third-party calls go through the server. Gmail OAuth scoped to send only; sessions are server-validated.
- **Reliability:** Pipeline runs server-side with retries + per-call timeouts; results stream in so one failed match doesn't kill the batch.
- **Cost control:** Cap matches per run (default 25); cap Tavily calls; cache where safe. Show the count before running.
- **Latency:** Stream results as they complete; first card in a few seconds, not after the whole batch.

---

## 9. Hackathon scope: MVP vs cut

**Must-have (P0):** F1–F8 + Voice Profile (§5).
**Nice-to-have (P1):** F9 empty-state, F10 footer, F11 multiple profiles, F12 auth, "Sound like me" extraction.
**Cut freely:** sequencing, CSV export, learn-from-edits.

---

## 10. Demo script (target < 90s)

1. Open the web app and show my saved **Voice Profile** (founder-to-founder, brief, warm).
2. Pick input type **Investor**, type: *"Pre-seed investors backing vertical SaaS in logistics, £100k–£500k, UK/EU."*
3. Watch match cards stream onto the dashboard: Tavily finds partners, AI writes notes + an angle, Lightfern completes the record.
4. Open a generated email — it uses the angle **and sounds like me**.
5. Swap to "Polished professional" profile → regenerate → visibly different tone. (The wow.)
6. Click **Send** → it goes out through my Gmail. Done.

---

## 11. Success metrics

**Hackathon:** full input → match → notes → Lightfern completion → voiced email → sent runs live in the browser; the Voice Profile swap visibly changes the same email; Lightfern's auto-completion is visibly part of the pipeline.

**Product (if continued):** reply rate vs a generic-template control; % of emails sent with ≤1 edit.

---

## 12. Known risks & light mitigations

These were flagged by the `/council` review. The core flow is kept by choice; mitigations are optional hackathon hardening.

| Risk | Light mitigation (optional) |
|---|---|
| **Auto-send to a stranger** is distrusted and raises GDPR/PECR concerns | Offer a **"review before send" toggle** (default on for real use, off for the demo). Keep the compliance footer (F10). |
| **Tavily isn't a contact database** — match quality varies, emails may be missing/guessed | Use Lightfern auto-completion to fill/verify contact fields; show source links per card; honest empty-state (F9). |
| **Hallucinated facts** in notes/email | AC5: email uses only the generated notes; show the source so the user can sanity-check before send. |
| **Gmail send** restricted-scope OAuth verification friction | For the demo, consider **"create a Gmail draft"** instead of live send, or a single pre-authorized test account. |
| **Per-run cost** unbounded on broad queries | Hard cap matches per run (default 25); cap Tavily/LLM calls. |

---

## 13. Open questions

1. **Send vs review** — default to auto-send (original), or ship the review toggle on?
2. **Send mechanism** — Gmail API live send vs. create a Gmail draft (lower OAuth-verification friction).
3. **Voice Profile storage** — server DB (survives device, ties to the signed-in account) vs. browser `localStorage` (simpler). Default: `localStorage` for MVP, DB if auth lands.
4. **Lightfern access** — confirm whether we hit Lightfern via MCP tools or REST, and what auth the hackathon provides.

---

*Earlier evaluations for reference: `council-out/2026-06-20-lightfern-gtm-outreach-extension.md` (original, 61/100) and `council-out/2026-06-20-lightfern-reach-refined.md` (refined, 58/100).*
