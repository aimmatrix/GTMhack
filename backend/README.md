# Lightfern Reach — Backend

Natural-language target → **Unify** search → **Gemini** research packets → **Gmail** draft handoff (Lightfern Chrome extension takes over in Gmail).

Node + TypeScript + Fastify, SSE streaming. **Runs end-to-end with zero API keys** (mock search + deterministic notes + Gmail compose deep-link); add keys to flip each module live.

## Quick start
```bash
cd backend
cp .env.example .env      # optional — works empty
npm install
npm run dev               # http://localhost:8787
```
Check it's up: `curl localhost:8787/api/health`

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/brief` | conversation input → structured search brief |
| POST | `/api/run` | search + research, **streams cards via SSE** |
| GET | `/api/run/:id` | fetch a run's state (poll/fallback) |
| POST | `/api/lightfern/handoff` | research packet → Gmail draft / compose link |
| GET | `/api/health` | status + which providers are live vs mock |

Full request/response shapes + frontend examples: **[API-CONTRACT.md](./API-CONTRACT.md)**.

## Going live (drop keys into `.env`)
- **Unify search:** set `UNIFY_API_KEY` (+ `UNIFY_API_BASE_URL`). Empty → mock fixtures.
- **Gemini:** set `GEMINI_API_KEY` (+ `GEMINI_MODEL`). Empty → deterministic notes.
- **Gmail draft:** set `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `GMAIL_SENDER`. Empty → Gmail compose deep-link (no auth).

`SEARCH_PROVIDER`, `LLM_PROVIDER`, `HANDOFF_MODE` can force `mock` / `auto` / live.

## Architecture
```
src/
  types.ts            # frozen shared contract (DTOs + provider interfaces)
  config.ts           # env → typed config (auto-selects live vs mock)
  container.ts        # composition root (wires providers + services)
  orchestrator.ts     # brief → search → enrich → research → stream cards
  server.ts / index.ts# Fastify app + boot
  routes/             # brief, run (SSE), handoff, health
  store/runStore.ts   # in-memory RunStore (swappable)
  providers/
    search/           # Unify adapter + mock fixtures        (SearchProvider)
    llm/              # Gemini + mock                         (LLMProvider)
  services/
    brief.ts          # NL → SearchBrief                      (BriefService)
    research.ts       # enriched candidate → grounded notes   (ResearchService)
  handoff/            # packet → email → Gmail draft/link     (HandoffService)
```
Every module implements an interface in `types.ts`, so live and mock are interchangeable and pieces can be built/tested independently.
