# Gmail draft handoff — setup & demo

Lightfern Reach creates a **real Gmail draft** from a research packet when OAuth is configured. Without OAuth, it falls back to a no-auth **Gmail compose deep-link** so the demo always works.

## 1. Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. **Enable the Gmail API**: APIs & Services → Library → search “Gmail API” → Enable.
3. **OAuth consent screen** (APIs & Services → OAuth consent screen):
   - User type: **External** (fine for a personal/test account).
   - Add your test Gmail as a **Test user**.
   - Scopes: add `https://www.googleapis.com/auth/gmail.compose` (create drafts only).
4. **Credentials** → Create credentials → **OAuth client ID**:
   - Application type: **Web application** (or Desktop — both work with the script below).
   - Authorized redirect URI: `http://localhost:8788/oauth2callback`
   - Copy **Client ID** and **Client secret**.

## 2. Obtain a refresh token

From `backend/`:

```bash
cp .env.example .env   # if you haven't already

# Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to .env, then:
npm run gmail:oauth
```

The script prints an auth URL, starts a local listener on port **8788**, and after you approve access prints:

```
GMAIL_REFRESH_TOKEN=...
```

Add to `backend/.env`:

```env
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=the-token-from-the-script
GMAIL_SENDER=you@gmail.com
HANDOFF_MODE=auto
```

Restart the backend. Health check should show `handoff: gmail_api`:

```bash
curl -s http://localhost:8787/api/health | jq .
```

## 3. Verify a real draft

Smoke-test draft creation (uses your `.env` credentials):

```bash
npx tsx scripts/verify-gmail-draft.ts
```

Or via the API after a mock run:

```bash
curl -s -X POST http://localhost:8787/api/lightfern/handoff \
  -H 'Content-Type: application/json' \
  -d '{
    "packet": {
      "match": { "name": "Test Recipient", "company": "Demo Co", "email": "recipient@example.com" },
      "why_match": "Demo verification of Gmail draft handoff.",
      "notes": ["This is a test note from the research packet."],
      "suggested_angle": "Keep it short — this is only a connectivity check.",
      "sources": [],
      "confidence": "high"
    },
    "sender": {
      "name": "Demo Sender",
      "company": "Lightfern Reach",
      "whatYouDo": "We build AI-assisted outreach tools.",
      "goal": "Confirm the Gmail draft pipeline works."
    }
  }' | jq .
```

Expected when OAuth works:

```json
{
  "result": {
    "mode": "gmail_draft",
    "draftId": "r…",
    "gmailUrl": "https://mail.google.com/mail/u/0/#drafts?compose=…",
    "subject": "…",
    "body": "…"
  }
}
```

Open `gmailUrl` in the browser signed in as `GMAIL_SENDER` — the draft should appear in **Drafts** with subject and body prefilled.

If OAuth is missing or fails, `mode` is `compose_link` and `gmailUrl` is a prefilled compose window (no server-side draft).

## 4. Demo runbook (Lightfern + Gmail)

End-to-end flow for a hackathon demo:

1. **Run the backend** (mock search/LLM is fine): `npm run dev`
2. **Build a brief** → **Run search** → pick a match card on the dashboard.
3. Click **“Draft in Lightfern”** (or POST `/api/lightfern/handoff` with the card’s packet + sender context).
4. Frontend opens `result.gmailUrl` in a new tab:
   - `gmail_draft` → draft opens in Gmail (best demo path).
   - `compose_link` → prefilled compose window (zero-setup fallback).
5. In Gmail, run the **Lightfern Chrome extension** on the draft to polish tone and send.

The backend email is a **starting draft** (~120–160 words) grounded in the packet (`why_match`, `suggested_angle`, `notes`, sender context). Lightfern refines it — we never fabricate facts beyond the packet.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| `compose_link` instead of `gmail_draft` | Set all four `GMAIL_*` vars; `HANDOFF_MODE=auto` or `gmail_api`. |
| `invalid_grant` on draft create | Re-run `npm run gmail:oauth` for a new refresh token. |
| Draft list opens but not the editor | Open `gmailUrl` while logged into `GMAIL_SENDER`; URL uses the draft message id. |
| Redirect URI mismatch | Add exactly `http://localhost:8788/oauth2callback` in Cloud Console. |

## Security notes

- Never commit `.env` or log refresh tokens / client secrets.
- Use a dedicated test Gmail account for demos.
- Scope is `gmail.compose` only — the app cannot read or send mail without separate scopes.
