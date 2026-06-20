# Lightfern Reach — Backend API Contract (for the frontend)

Everything the frontend needs to wire the UI to the backend. **The backend does not touch the frontend; the frontend calls these endpoints over `fetch` / `EventSource`.**

- **Base URL (local):** `http://localhost:8787`
- Configurable via the backend `PORT`. CORS is open (`*`) by default.
- All request/response bodies are JSON, except `POST /api/run` which streams **Server-Sent Events**.

The flow mirrors the PRD:
`POST /api/brief` → (show/edit brief, answer any clarifications) → `POST /api/run` (stream cards) → user picks a card → `POST /api/lightfern/handoff` → open the returned Gmail URL (Lightfern extension takes over in Gmail).

---

## 0. Wiring the current frontend (the Noodle dashboard)

The app already exists and is currently **static** (no backend calls). Files:
- `index.html` + `assets/js/landing.js` — landing / reach entry.
- `dashboard/index.html` + `assets/js/dashboard.js` — the dashboard (where matches + handoff live).
- `assets/css/landing.css`, `assets/css/dashboard.css`.

**Entry already works:** the landing `[data-reach-form]` submits `name="target"` to `/dashboard/?target=…` and stores `localStorage["noodle-last-target"]`. `dashboard.js#hydrateSeedTarget()` reads it back. No change needed there — the dashboard just needs to call the backend.

### What's static today → what to call
| Element in `dashboard/index.html` | Today | Wire to |
|---|---|---|
| `form[data-reach-builder]` (inputs `target`, `goal`) submit | updates text only | `POST /api/brief` then stream `POST /api/run` |
| `[data-brief-target]` / `[data-brief-goal]` / `[data-brief-status]` | static | fill from the `brief` (and live status from SSE `status` events) |
| `.packet-list` (hardcoded `.packet-card`s) | 2 fixed cards | **clear, then append one card per SSE `card` event** |
| `button[data-send-packet]` on each card | updates greeting | `POST /api/lightfern/handoff`, then `window.open(result.gmailUrl)` |
| assistant `[data-assistant-greeting]` | static | optional: reflect status/progress |

### Recommended module split (so work parallelizes without collisions)
Everything is ES modules (`<script type="module">`). Keep the backend calls in one file and have the others depend on it:

- **`assets/js/api.js`** (new) — the only file that knows the backend. Exports:
  ```js
  export const BASE_URL = localStorage.getItem("noodle-api") || "http://localhost:8787";
  export async function buildBrief({ description, targetType, goal, location }); // → brief
  export function streamRun(body, { onRun, onStatus, onCard, onDone, onError }); // body = {brief} | {input}
  export async function handoff({ packet, sender });   // → result
  export async function getRun(id);
  export async function health();
  ```
  `streamRun` POSTs JSON and parses the SSE stream via `fetch` + `response.body.getReader()` (see §2 example) — **not** `EventSource` (we POST a body).

- **`assets/js/cards.js`** (new) — pure rendering into `.packet-list`. Exports `clearPackets()`, `setMatchCount(n)`, `showSearching()`, `showEmpty(msg)`, `renderPacket(card)`. `renderPacket` builds a `.packet-card` (reuse existing classes) from a **MatchCard** (see §2) and its "Draft in Lightfern" button must do:
  ```js
  document.dispatchEvent(new CustomEvent("noodle:draft", { detail: card }));
  ```

- **`assets/js/handoff.js`** (new) — listens for `noodle:draft`, collects sender context once (modal → `localStorage["noodle-sender"]`), calls `api.handoff({ packet, sender })`, opens `result.gmailUrl`.

- **`assets/js/dashboard.js`** (edit) — the glue: on `[data-reach-builder]` submit, `clearPackets()` + `showSearching()`, `await buildBrief(...)`, fill the brief panel, then `streamRun({ brief }, { onCard: renderPacket, onStatus, onDone })`. Auto-run once on load if a seed target is present.

**Card → DOM mapping:** `match.name` → `h3`; `Math.round(confidence→%)` or a fit label → the `92% match` chip; `why_match` → the description `<p>`; `suggested_angle` + `notes[]` → the `<ul>`; `sources[]` → linked sources; show `match.email` and a `lightfern.completion_status` badge (ready/partial). Keep the **insight/angle prominent** — that's the demo's "wow" (per `DEMO-VIDEO-SCRIPT.md`).

> Backend must be running: `cd backend && npm run dev` (defaults to `http://localhost:8787`, CORS open). With no API keys it serves realistic mock data, so the frontend can be wired and demoed immediately.

---

## 1. `POST /api/brief` — natural language → structured brief

**Request body** (`ConversationInput`):
```json
{
  "description": "pre-seed investors in London who back AI sales tools",
  "targetType": "investors",        // optional: customers | investors | startups | local_businesses (inferred if omitted)
  "goal": "our Lightfern hackathon project",  // optional ("what do you want to talk about?")
  "location": "London"               // optional
}
```

**Response** `200`:
```json
{
  "brief": {
    "id": "uuid",
    "targetType": "investors",
    "entity": "people",
    "looking_for": "Pre-seed investors",
    "location": "London / UK",
    "interest": "AI sales tools",
    "goal": "introduce our Lightfern hackathon project",
    "filters": { "...": "Unify filters, opaque to the UI" },
    "max_results": 8,
    "raw": { "description": "...", "goal": "..." },
    "needs_clarification": [
      { "field": "goal", "question": "What do you want to talk to them about?", "examples": ["Our Lightfern hackathon project"] }
    ]
  }
}
```

- Render the human-readable lines (`looking_for`, `location`, `interest`, `goal`) as the editable **search brief**.
- If `needs_clarification` is **non-empty**, ask those questions first; collect answers, then either call `/api/brief` again (e.g. with `goal` filled) or send the edited brief straight to `/api/run`.
- The user may edit the brief; send the (possibly edited) `brief` object back to `/api/run`.

`400` on missing `description`: `{ "error": "invalid_input", "details": {...} }`.

---

## 2. `POST /api/run` — search + research, **streamed as SSE**

Send **either** an already-built brief **or** raw input (the backend will build the brief for you):
```json
{ "brief": { /* the SearchBrief from step 1, possibly edited */ } }
```
```json
{ "input": { "description": "...", "goal": "...", "targetType": "investors" } }
```

**Response:** `Content-Type: text/event-stream`. Each SSE message has an `event:` name and JSON `data:`.

| event    | data shape                                                        | when |
|----------|-------------------------------------------------------------------|------|
| `run`    | `{ type:"run", runId, brief }`                                    | once, first — keep `runId` |
| `status` | `{ type:"status", message, found?, researched? }`                | progress updates |
| `card`   | `{ type:"card", card }` — see **MatchCard** below                 | one per match, as ready |
| `done`   | `{ type:"done", runId, stats:{ found, researched, dropped } }`    | once, at the end |
| `error`  | `{ type:"error", message }`                                       | on failure |

### MatchCard (the research packet you render)
```json
{
  "id": "uuid",
  "match": { "name": "Jane Smith", "company": "Example Ventures", "role": "Partner", "location": "London", "url": "https://...", "email": "jane@example.com" },
  "why_match": "Invests in pre-seed AI GTM tools and has backed sales-workflow startups.",
  "notes": ["Focuses on B2B SaaS at pre-seed.", "Recently wrote about AI in go-to-market."],
  "suggested_angle": "Mention the Lightfern hackathon project as a fast AI-assisted GTM prototype.",
  "sources": [{ "title": "Profile", "url": "https://..." }],
  "confidence": "high",
  "lightfern": { "completion_status": "ready", "completed_fields": ["email", "company", "role"] }
}
```

### Frontend example (stream with `fetch`, since we POST a body)
```js
const res = await fetch("http://localhost:8787/api/run", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ brief }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split("\n\n");
  buffer = chunks.pop() ?? "";
  for (const chunk of chunks) {
    const line = chunk.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const evt = JSON.parse(line.slice(6));
    if (evt.type === "run") runId = evt.runId;
    if (evt.type === "status") setStatus(evt.message);
    if (evt.type === "card") appendCard(evt.card);   // stream cards in
    if (evt.type === "done") finish(evt.stats);
    if (evt.type === "error") showError(evt.message);
  }
}
```
> Note: `EventSource` only does GET, so use the `fetch` + reader pattern above to POST the brief. (If you'd rather use `EventSource`, ask and we'll add a GET variant.)

---

## 3. `GET /api/run/:id` — fetch a run's current state

Polling / non-SSE fallback. Returns the persisted run including all cards so far:
```json
{ "run": { "id", "status": "running|completed|error", "brief", "cards": [ /* MatchCard[] */ ], "stats": { "found", "researched", "dropped" }, "createdAt, updatedAt" } }
```
`404` if unknown id.

---

## 4. `POST /api/lightfern/handoff` — research packet → Gmail draft

No Lightfern API exists, so the handoff builds an **email draft from the packet**. The user opens it in Gmail and runs the **Lightfern Chrome extension** there.

**Request** (`HandoffRequest`):
```json
{
  "runId": "uuid",            // optional
  "cardId": "uuid",           // optional
  "packet": { /* the MatchCard the user selected */ },
  "sender": {                  // optional — collect in the "first handoff" modal
    "name": "Ammad",
    "company": "Lightfern Reach",
    "role": "Founder",
    "whatYouDo": "AI-assisted GTM research",
    "goal": "intro our hackathon project",
    "fromEmail": "you@company.com"
  }
}
```

**Response** `200` (`HandoffResult`):
```json
{
  "result": {
    "mode": "gmail_draft" | "compose_link" | "mock",
    "draftId": "r-123...",        // present when a real Gmail draft was created
    "gmailUrl": "https://mail.google.com/mail/...",  // OPEN THIS for the user
    "to": "jane@example.com",
    "subject": "Lightfern Reach × Example Ventures",
    "body": "Hi Jane, ...",        // the context-rich starting draft
    "message": "Draft created in Gmail — open it and run Lightfern."
  }
}
```

**Frontend action:** label the button **“Draft in Lightfern”**. On click, POST the packet, then `window.open(result.gmailUrl, "_blank")`. Show `result.message`. You can preview `result.subject` / `result.body` in the card before opening.

---

## 5. `GET /api/health`
```json
{ "ok": true, "providers": { "search": "unify|mock", "llm": "gemini|mock", "handoff": "gmail_api|compose_link" }, "maxResults": 8, "time": "..." }
```
Use to show whether the demo is running live or on mock data.

---

## Questions for the frontend dev / things to confirm
1. Do you want an `EventSource` (GET) variant of `/api/run` in addition to the POST stream? (Easy to add.)
2. The “first handoff” modal should collect `sender` fields — see §4. Send them on the **first** handoff and reuse after.
3. Card UI should show `confidence` and `lightfern.completion_status` (ready/partial/unavailable) as small badges per the PRD.
