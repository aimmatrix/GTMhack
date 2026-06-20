/**
 * Smoke-test Gmail draft creation using backend/.env credentials.
 * Run: npx tsx scripts/verify-gmail-draft.ts
 */
import 'dotenv/config';
import { GmailClient } from '../src/handoff/gmail';
import { buildEmailFromPacket } from '../src/handoff/packet';
import type { MatchCard } from '../src/types';

const packet: MatchCard = {
  id: 'verify-1',
  match: {
    name: 'Verify Recipient',
    company: 'Test Co',
    email: process.env.GMAIL_VERIFY_TO || 'verify@example.com',
  },
  why_match: 'Connectivity check for Gmail draft handoff.',
  notes: ['Automated verify script — safe to delete this draft.'],
  suggested_angle: 'Confirm OAuth and MIME encoding end-to-end.',
  sources: [],
  confidence: 'high',
  lightfern: { completion_status: 'ready', completed_fields: [] },
};

async function main() {
  const { to, subject, body } = buildEmailFromPacket(packet, {
    name: 'Verify Script',
    company: 'Lightfern Reach',
    whatYouDo: 'Backend Gmail handoff verification.',
  });

  const client = new GmailClient();
  const { draftId, gmailUrl } = await client.createDraft({
    to,
    subject,
    body,
    from: process.env.GMAIL_SENDER,
  });

  console.log(JSON.stringify({ ok: true, draftId, gmailUrl, subject }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: (err as Error).message }, null, 2));
  process.exit(1);
});
