import type { MatchCard, SenderContext } from '../types';

/**
 * Turn a research packet ({@link MatchCard}) into outreach *context* for
 * Lightfern — not a finished email. The Gmail draft holds structured facts
 * about the recipient ("CEO of …, sells cars, was at …") plus why they fit
 * and the sender's goal. Lightfern reads this and writes the actual message.
 *
 * Pure and deterministic: no network, no clock, no randomness. Everything is
 * grounded in the packet (and optional sender context); we never fabricate
 * facts beyond what's provided.
 */
export function buildEmailFromPacket(
  packet: MatchCard,
  sender?: SenderContext,
): { to?: string; subject: string; body: string } {
  const to = packet.match.email || undefined;
  const subject = buildContextSubject(packet);
  const body = buildContextBody(packet, sender);
  return { to, subject, body };
}

function buildContextSubject(packet: MatchCard): string {
  const name = clean(packet.match.name);
  const company = clean(packet.match.company);
  if (name && company) return `${name} — ${company}`;
  return name || company || 'Outreach context';
}

function buildContextBody(packet: MatchCard, sender?: SenderContext): string {
  const sections: string[] = ['Context for Lightfern:', ''];

  const profile = buildRecipientProfile(packet);
  if (profile) {
    sections.push('About the recipient:');
    sections.push(profile);
    sections.push('');
  }

  const why = clean(packet.why_match);
  const angle = clean(packet.suggested_angle);
  if (why || angle) {
    sections.push('Outreach guidance:');
    if (why) sections.push(`Why they're a fit: ${why}`);
    if (angle) sections.push(`Suggested angle: ${angle}`);
    sections.push('');
  }

  const senderCtx = buildSenderContext(sender);
  if (senderCtx) {
    sections.push('About me:');
    sections.push(senderCtx);
  }

  return sections.join('\n').trimEnd();
}

/** Natural prose: "Sarah Chen is VP Partnerships at Northwind. Series B …" */
function buildRecipientProfile(packet: MatchCard): string {
  const match = packet.match;
  const fragments: string[] = [];

  const lead = buildProfileLead(match.name, match.role, match.company, match.location);
  if (lead) fragments.push(lead);

  const notes = (packet.notes || []).map((n) => clean(stripBullet(n))).filter(Boolean);
  for (const note of notes) {
    fragments.push(ensurePeriod(note));
  }

  return fragments.join(' ');
}

function buildProfileLead(
  name?: string,
  role?: string,
  company?: string,
  location?: string,
): string {
  const n = clean(name);
  const r = clean(role);
  const c = clean(company);
  const loc = clean(location);

  if (!n && !r && !c) return '';

  if (n && r && c) {
    const prep = rolePreposition(r) === 'of' ? 'of' : 'at';
    let lead = `${n} is ${r} ${prep} ${c}`;
    if (loc) lead += ` (${loc})`;
    return `${ensurePeriod(lead)}`;
  }

  if (n && c) {
    let lead = `${n} works at ${c}`;
    if (loc) lead += ` (${loc})`;
    return `${ensurePeriod(lead)}`;
  }

  if (n && r) {
    let lead = `${n} is ${r}`;
    if (loc) lead += ` (${loc})`;
    return `${ensurePeriod(lead)}`;
  }

  if (n) return `${ensurePeriod(n)}`;
  if (r && c) return `${ensurePeriod(`${r} ${rolePreposition(r) === 'of' ? 'of' : 'at'} ${c}`)}`;
  return c ? `${ensurePeriod(c)}` : '';
}

function buildSenderContext(sender?: SenderContext): string {
  if (!sender) return '';

  const parts: string[] = [];
  const name = clean(sender.name);
  const company = clean(sender.company);
  const role = clean(sender.role);
  const whatYouDo = clean(sender.whatYouDo);
  const goal = clean(sender.goal);

  if (name && company) {
    parts.push(role ? `${name}, ${role} at ${company}` : `${name}, ${company}`);
  } else if (name) {
    parts.push(name);
  } else if (company) {
    parts.push(company);
  }

  if (whatYouDo) parts.push(ensurePeriod(whatYouDo));
  if (goal) parts.push(`Goal: ${ensurePeriod(goal)}`);

  return parts.join('. ').replace(/\.\./g, '.').trim();
}

function rolePreposition(role: string): 'of' | 'at' {
  return /^(ceo|cfo|cto|coo|founder|co-?founder|owner|president|chair(man|woman|person)?)/i.test(
    role.trim(),
  )
    ? 'of'
    : 'at';
}

// ── small pure string helpers ──────────────────────────────────────────────

function clean(v?: string): string {
  return (v || '').trim().replace(/\s+/g, ' ');
}

function stripBullet(text: string): string {
  return text.replace(/^[\s•\-*•]+/, '').replace(/[.!?]+$/, '').trim();
}

function ensurePeriod(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}
