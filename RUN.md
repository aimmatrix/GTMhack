# Run the Noodle / Lightfern Reach demo

End-to-end local setup: landing page → dashboard → live search → research cards → Lightfern handoff → Gmail.

## Prerequisites

- **Node.js** 18.17+ (backend)
- **Python 3** (static frontend server)
- Optional: API keys in `backend/.env` (see [backend/README.md](./backend/README.md)). The demo runs with mocks if keys are missing.

## 1. Start the backend

```bash
cd backend
cp .env.example .env   # optional — works empty
npm install
npm run dev
```

The API listens on **http://localhost:8787**.

Verify:

```bash
curl http://localhost:8787/api/health
```

You should see `"ok": true` plus which providers are live vs mock.

## 2. Serve the frontend

From the **repo root** (not `backend/`):

```bash
python3 -m http.server 4173
```

Open **http://localhost:4173/** in your browser.

> Use `localhost` (not `127.0.0.1`) so the dashboard can reach the API at `http://localhost:8787` without CORS surprises.

## 3. Full demo path

### Landing → Dashboard

1. Open **http://localhost:4173/**
2. Enter a target, e.g. `Pre-seed investors in London who back AI sales tools`
3. Click **Go to Dashboard** — you land on `/dashboard/?target=...` with the target pre-filled

### Find matches

4. On the dashboard, confirm **Target** and **Goal**, then click **Find matches**
5. Watch the **Search brief** status update and **Research packets** show loading skeletons
6. Cards stream in one by one with confidence and Lightfern completion badges

### Draft in Lightfern → Gmail

7. Click **Draft in Lightfern** on any packet
8. First time only: fill in the **Before your first draft** modal (name + from email required). Context is saved in `localStorage` for later drafts.
9. The **Lightfern handoff** strip shows status and a draft preview
10. Gmail opens in a new tab (compose deep-link or API draft, depending on backend config)

### Optional shortcuts

| URL | Purpose |
|-----|---------|
| `http://localhost:4173/` | Landing page |
| `http://localhost:4173/dashboard/` | Dashboard (manual target entry) |
| `http://localhost:4173/dashboard/?target=Investors%20in%20Berlin` | Skip landing; auto-run search |

Override API base URL in the browser console:

```js
localStorage.setItem("noodle-api", "http://localhost:8787");
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Cards never load / “Search failed” | Confirm backend is running on `:8787` and `curl localhost:8787/api/health` succeeds |
| CORS or network errors | Serve frontend from repo root on `:4173`; keep API on `:8787` |
| Gmail doesn’t open | Expected with compose-link mode; check the handoff strip for the draft preview. Add Gmail OAuth env vars for real drafts — see [backend/docs/gmail-setup.md](./backend/docs/gmail-setup.md) |
| Stale static HTML cards on first paint | Click **Find matches** — `dashboard.js` replaces the placeholder list on search |

## Glue notes (cross-agent integration)

Issues found during end-to-end wiring (Agent 5 — styles & run-it-together):

1. **`cards.js` inline styles override CSS badges** — Lightfern completion badges, angle callouts, sources, and empty-state text use inline `style=` attributes instead of the classes defined in `dashboard.css` (`.badge-lightfern--*`, `.packet-angle`, `.packet-sources`, `.packet-empty`). Visuals work but CSS variants (partial/unavailable, error empty state) won’t apply until cards.js adopts those classes / `data-confidence` / `data-status` attributes.

2. **Static seed cards in `dashboard/index.html`** — Two hard-coded packet cards remain in HTML until the first search clears them via `clearPackets()`. Brief flash of stale demo content on cold load without `?target=`.

3. **Legacy `data-send-packet` buttons** — Static HTML buttons use `data-send-packet`; live cards dispatch `noodle:draft` via `handoff.js`. Static buttons don’t trigger handoff.

4. **No `is-error` class on failed searches** — `showEmpty(message)` renders `.packet-empty` for both zero results and API errors; CSS error styling (`.packet-empty.is-error`) is ready but unused.

5. **Handoff preview uses inline styles** — `handoff.js` `showHandoffPreview()` injects inline styles; `[data-handoff-preview]` rules in CSS apply only after those are removed.
