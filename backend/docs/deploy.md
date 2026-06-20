# Deploy Lightfern Reach backend

One-command deploy to [Render](https://render.com) using the included Blueprint. The server runs in **mock mode** by default (no API keys required) and exposes the full SSE run pipeline.

## Prerequisites

- A [Render](https://render.com) account
- [Render CLI](https://render.com/docs/cli) installed (`brew install render` or see Render docs)

## One-command deploy

From the `backend/` directory:

```bash
render blueprint launch
```

Render reads `render.yaml`, builds the Docker image, and deploys the web service. When the deploy finishes, open:

```text
https://<your-service>.onrender.com/api/health
```

You should see `{ "ok": true, "providers": { "search": "mock", "llm": "mock", ... } }`.

### Alternative: Docker locally

```bash
docker build -t lightfern-reach .
docker run --rm -p 8787:8787 lightfern-reach
curl http://localhost:8787/api/health
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8787` | HTTP port |
| `CORS_ORIGIN` | `*` | Allowed frontend origins |
| `SEARCH_PROVIDER` | `auto` | `mock` or `unify` (needs `UNIFY_API_KEY`) |
| `LLM_PROVIDER` | `auto` | `mock` or `gemini` (needs `GEMINI_API_KEY`) |
| `HANDOFF_MODE` | `auto` | `compose_link` or `gmail_api` (needs Gmail OAuth) |
| `SUPABASE_URL` | — | When set with `SUPABASE_KEY`, persists runs to Supabase |
| `SUPABASE_KEY` | — | Supabase service-role or anon key |

Set secrets in the Render dashboard under **Environment** for your service.

## Optional: Supabase persistence

1. Create a Supabase project.
2. Run the migration in `supabase/migrations/20250620000000_runs.sql` (SQL editor or CLI).
3. Set `SUPABASE_URL` and `SUPABASE_KEY` on Render.

Without Supabase, runs are kept in memory (fine for demos; lost on restart).

## Smoke test after deploy

Replace `BASE_URL` with your Render URL:

```bash
BASE_URL=https://your-service.onrender.com ./scripts/smoke.sh
```

Or against local dev:

```bash
npm run dev   # terminal 1
./scripts/smoke.sh   # terminal 2
```

## Build verification

```bash
npm ci
npm run build    # emits dist/
node dist/index.js
npm test         # E2E suite in mock mode
```

## Frontend client

Import `client/lightfernClient.ts` from your frontend, or open `client/example.html` via a static server while the API runs on port 8787.
