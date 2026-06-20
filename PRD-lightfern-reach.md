# PRD — Lightfern Reach

**Working title:** Lightfern Reach (rename freely)
**One-liner:** A web app where you describe who you want to reach, it finds matching people or businesses online, prepares useful research notes and outreach angles, then sends that context into Lightfern so Lightfern can draft the email.
**Author:** Ammad
**Date:** 2026-06-20
**Status:** Draft v4 — reframed for Lightfern hackathon
**For:** Lightfern GTM Hackathon (London, by Cursor x GTMengineer.dev x Lightfern)
**Core positioning:** Lightfern drafts the emails. Lightfern Reach helps users find the right recipients and gives Lightfern better context.

---

## 1. Concept

You open the app and type, in normal language, who you want to reach.

Example:

> Investors in London who back AI startups

The app asks one lightweight follow-up:

> What do you want to talk to them about?

Example:

> Our Lightfern hackathon project

Then the app finds possible matches, researches each one, creates a short context packet, and hands that packet to Lightfern. Lightfern is the drafting layer.

**The flow:**

```text
User describes target
   -> app clarifies goal
   -> app builds a search brief
   -> Tavily/search finds matching people or businesses
   -> AI creates research notes, match reasons, and suggested angles
   -> Lightfern completes/enriches the record
   -> user sends the context to Lightfern
   -> Lightfern drafts the email
```

The product should feel like texting an assistant, not filling out a sales form.

---

## 2. Goals & non-goals

### Goals

- G1 — Let the user describe who they want to reach in simple natural language.
- G2 — Ask only the minimum follow-up questions needed to create a useful search brief.
- G3 — Find matching people/businesses across four use cases: customers, investors, startups, and local businesses.
- G4 — Show each match as a clear research card: who they are, why they match, useful notes, suggested angle, and sources.
- G5 — Use Lightfern auto-completion/enrichment to complete the record where possible.
- G6 — Hand the researched context into Lightfern so Lightfern can draft the email.
- G7 — Demo the full arc live in the browser: describe target -> matches -> research cards -> Lightfern handoff -> Lightfern draft.

### Non-goals

- NG1 — The app does not write the final email itself.
- NG2 — The app does not replace Lightfern's drafting experience.
- NG3 — No multi-touch sequences, drip campaigns, A/B tests, CRM sync, or analytics dashboard.
- NG4 — No custom deliverability infrastructure.
- NG5 — No long onboarding before the user gets value.

---

## 3. Target users & input types

Primary user: a solo founder, operator, SDR, agency owner, or builder who needs to find a small number of relevant people and prepare high-quality context for outreach.

| Input type | Example user input | What the app finds | Lightfern use |
|---|---|---|---|
| **Customers** | "Heads of Ops at UK logistics companies with 50-500 employees" | Likely buyers | Draft a sales intro |
| **Investors** | "Pre-seed investors in London who back AI sales tools" | Relevant investors | Draft a founder intro |
| **Startups** | "Seed-stage AI compliance startups in London" | Companies for partnerships or research | Draft a partnership note |
| **Local businesses** | "Independent coffee shops in Shoreditch with outdated websites" | Local business leads | Draft a service pitch |

The user should not need to understand filters up front. They should be able to type what they mean.

---

## 4. Core user flow

### First screen

The app opens on one main question:

> Who do you want to reach?

Placeholder examples:

- "Investors in London who fund AI startups"
- "Coffee shops in Shoreditch with outdated websites"
- "Heads of Operations at UK logistics companies"

The user can optionally choose a target type:

- Customers
- Investors
- Startups
- Local businesses

If they do not choose one, the app infers it.

### Lightweight follow-up

After the first answer, the app asks:

> What do you want to talk to them about?

This captures the outreach goal, not the final email copy.

Examples:

- "Our Lightfern hackathon project"
- "A quick intro to our logistics onboarding product"
- "Website redesign services"
- "Potential partnership"

### Live search brief

As the user answers, the app shows a small brief:

```text
Looking for: pre-seed investors
Location: London / UK
Interest: AI sales tools
Goal: introduce our Lightfern hackathon project
Output: research cards for Lightfern
```

The user can edit the brief before running the search.

### Search and results

The user clicks:

> Find matches

The dashboard streams in cards as each match is ready.

Each card shows:

- Name / company
- Why this matches
- Useful notes
- Suggested outreach angle
- Source links
- Lightfern completion status
- Primary action: **Draft in Lightfern**

The app should not show a generated final email. It should show the context Lightfern will use.

---

## 5. Fluid UX principles

The experience should feel simple and conversational.

### Principle 1 — Start with one question

Do not start with a form full of fields. Start with:

> Who do you want to reach?

### Principle 2 — Ask follow-ups only when needed

If the input is clear, continue. If something important is missing, ask one short question.

Examples:

- Missing goal: "What do you want to talk to them about?"
- Missing location: "Should I focus on a specific location?"
- Too broad: "Do you want quality over quantity, or a wider list?"

### Principle 3 — Show the brief before searching

The app should translate the user's messy sentence into a clean brief so the user can trust what will happen.

### Principle 4 — Progressive onboarding

Do not block first use with onboarding.

Ask for sender/company context only when it is needed for the Lightfern handoff:

- Your name
- Company
- What you do
- What this outreach is about

This can appear as a small modal before the first Lightfern draft.

### Principle 5 — Make Lightfern the hero

Use button labels like:

- **Draft in Lightfern**
- **Send context to Lightfern**
- **Complete with Lightfern**

Avoid labels like:

- Generate email
- Write email
- Send email

---

## 6. Key feature: Research packet for Lightfern

The core output of this app is not an email. It is a structured research packet.

### Research packet fields

```json
{
  "match": {
    "name": "Jane Smith",
    "company": "Example Ventures",
    "role": "Partner",
    "location": "London",
    "url": "https://example.com"
  },
  "why_match": "Invests in pre-seed AI tools and has backed sales workflow startups.",
  "notes": [
    "Focuses on B2B SaaS at pre-seed.",
    "Recently wrote about AI in go-to-market workflows.",
    "Based in London with UK/EU investment focus."
  ],
  "suggested_angle": "Mention the Lightfern hackathon project as a fast prototype exploring AI-assisted GTM workflows.",
  "sources": [
    "https://example.com/profile",
    "https://example.com/blog/ai-gtm"
  ],
  "lightfern": {
    "completion_status": "ready",
    "completed_fields": ["email", "company", "role"]
  }
}
```

### Why this matters

Lightfern can draft better emails when it has better context. This app is the research and context layer before Lightfern drafting.

---

## 7. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | **Conversational input** — one main prompt: "Who do you want to reach?" | P0 |
| F2 | **Optional target type** — customers / investors / startups / local businesses. | P0 |
| F3 | **Clarifying follow-up** — ask what the user wants to talk about. | P0 |
| F4 | **Search brief** — show the interpreted target, location, interest, and goal before running. | P0 |
| F5 | **Search** — find candidate people/businesses with source links. | P0 |
| F6 | **Research notes** — generate summary, why-match, useful notes, and suggested angle. | P0 |
| F7 | **Lightfern completion** — send match/notes into Lightfern to complete or enrich the record. | P0 |
| F8 | **Results dashboard** — stream cards as each match is ready. | P0 |
| F9 | **Lightfern handoff** — send selected match context to Lightfern for drafting. | P0 |
| F10 | **Empty state** — show honest "no strong matches" instead of weak filler results. | P1 |
| F11 | **Progressive sender context** — collect name/company/what you do only when needed. | P1 |
| F12 | **Auth** — optional for MVP; required if Lightfern/Gmail account linking needs it. | P1 |

---

## 8. Suggested app screens

### Screen 1 — Conversational search

Main elements:

- Large input: "Who do you want to reach?"
- Optional chips: Customers, Investors, Startups, Local businesses
- Small examples under the input
- Continue button

### Screen 2 — Clarify goal

Main elements:

- Follow-up question: "What do you want to talk to them about?"
- User answer field
- Live search brief on the side or below
- Button: "Find matches"

### Screen 3 — Results dashboard

Main elements:

- Search brief summary at top
- Match cards streaming in
- Confidence or fit indicator
- Source links
- Suggested angle
- Button: "Draft in Lightfern"

### Screen 4 — First Lightfern handoff modal

Only if needed:

- Name
- Company
- What you do
- Outreach goal
- Button: "Send context to Lightfern"

---

## 9. Architecture

```text
Web app (Next.js + React)
  - conversational input
  - search brief UI
  - results dashboard
  - Lightfern handoff action

Backend / API routes
  - orchestrates search -> notes -> Lightfern completion
  - stores temporary run state
  - keeps API keys server-side
  - streams result cards as they are ready

External APIs
  - Tavily/search for discovery
  - Gemini/OpenAI for summaries, match reasons, and angles
  - Lightfern for completion and drafting handoff
```

### Recommended endpoints

- `POST /api/brief` — turns conversation input into a structured search brief.
- `POST /api/run` — runs search + research + Lightfern completion and streams cards.
- `POST /api/lightfern/handoff` — sends selected research packet to Lightfern for drafting.
- `GET /api/run/:id` — returns current run state.

---

## 10. Hackathon scope

### Must-have

- Conversational first input
- One follow-up question
- Search brief preview
- Search results as match cards
- AI-generated notes and suggested angle
- Lightfern completion/handoff
- "Draft in Lightfern" action

### Nice-to-have

- Saved sender/company context
- Editable search brief
- Empty/low-confidence state
- Auth/account linking
- Batch select multiple cards for Lightfern

### Cut freely

- Voice Profile
- Writing final email inside this app
- Sending emails from this app
- Multi-touch campaigns
- CRM sync
- Analytics

---

## 11. Demo script (target < 90s)

1. Open the app.
2. Type: "Pre-seed investors in London who back AI sales tools."
3. App asks: "What do you want to talk to them about?"
4. Type: "Our Lightfern hackathon project."
5. App shows the search brief.
6. Click **Find matches**.
7. Match cards stream in with names, why they match, notes, suggested angle, and sources.
8. Open one card and click **Draft in Lightfern**.
9. Lightfern receives the context and drafts the email.

The wow moment: the app makes Lightfern smarter by giving it researched, structured context.

---

## 12. Success metrics

### Hackathon success

- User can describe a target in natural language.
- App turns that into a clear search brief.
- App finds plausible matches.
- App produces useful research cards.
- Lightfern is visibly part of completion/drafting.
- The final email draft is produced by Lightfern, not by this app.

### Product success if continued

- % of match cards accepted for Lightfern drafting.
- % of Lightfern drafts that require little editing.
- Reply rate compared with outreach drafted without research context.
- Time from "who do you want to reach?" to first Lightfern draft.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Search results are weak or too broad | Show the interpreted search brief first; let the user edit it before running. |
| Tavily/search is not a contact database | Use Lightfern to complete/enrich records; show source links and confidence. |
| AI invents details | Research cards must include sources; notes should be grounded in source links. |
| App appears to compete with Lightfern | Do not generate final emails; make the primary action "Draft in Lightfern." |
| User feels blocked by setup | Use progressive onboarding only when Lightfern handoff needs sender context. |

---

## 14. Open questions

1. **Lightfern integration** — do we hand off via API, MCP tool, browser deep link, or demo mock?
2. **Completion vs drafting** — does Lightfern first complete the record, draft the email, or both in one step?
3. **Auth** — is login needed for the hackathon demo, or can we run with a demo Lightfern account?
4. **Search scope** — should the MVP cap at 5-10 high-quality matches instead of 25?
5. **Review surface** — should users edit the search brief before search, or only rerun after seeing weak results?

---
