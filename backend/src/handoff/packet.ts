import type { MatchCard, SenderContext } from '../types';

/**
 * Turn a research packet ({@link MatchCard}) into a context-rich *starting*
 * email draft. This is intentionally a strong first draft, not the final
 * email — the Lightfern Chrome extension polishes it before it's sent.
 *
 * Pure and deterministic: no network, no clock, no randomness. Everything is
 * grounded in the packet (and optional sender context); we never fabricate
 * facts beyond what's provided.
 */
export function buildEmailFromPacket(
  packet: MatchCard,
  sender?: SenderContext,
): { to?: string; subject: string; body: string } {
  const match = packet.match;
  const to = match.email || undefined;

  const senderName = firstName(sender?.name) || 'there';
  const signName = clean(sender?.name) || 'Lightfern Reach';
  const senderCompany = clean(sender?.company);
  const matchName = firstName(match.name) || 'there';

  const subject = buildSubject(packet, sender);
  const body = buildBody(packet, sender, { matchName, signName, senderName, senderCompany });

  return { to, subject, body };
}

function buildSubject(packet: MatchCard, sender?: SenderContext): string {
  const senderCompany = clean(sender?.company);
  const matchCompany = clean(packet.match.company);

  if (senderCompany && matchCompany) {
    return `${senderCompany} <> ${matchCompany}`;
  }
  if (matchCompany) {
    return `Quick idea for ${matchCompany}`;
  }

  const angle = firstSentence(packet.suggested_angle);
  if (angle) return truncate(angle, 72);

  if (senderCompany) return `A quick hello from ${senderCompany}`;
  return 'Reaching out';
}

function buildBody(
  packet: MatchCard,
  sender: SenderContext | undefined,
  ctx: { matchName: string; signName: string; senderName: string; senderCompany?: string },
): string {
  const lines: string[] = [];

  lines.push(`Hi ${ctx.matchName},`);
  lines.push('');

  const intro = buildIntro(packet, sender, ctx);
  if (intro) {
    lines.push(intro);
    lines.push('');
  }

  const context = buildContextLines(packet);
  for (const line of context) {
    lines.push(line);
  }
  if (context.length > 0) lines.push('');

  lines.push(buildAsk());
  lines.push('');
  lines.push('Best,');
  lines.push(ctx.senderCompany ? `${ctx.signName}\n${ctx.senderCompany}` : ctx.signName);

  const body = lines.join('\n');
  return trimToWordRange(body, 120, 160);
}

function buildIntro(
  packet: MatchCard,
  sender: SenderContext | undefined,
  ctx: { senderCompany?: string },
): string {
  const parts: string[] = [];

  const whatYouDo = clean(sender?.whatYouDo);
  const opener = ctx.senderCompany
    ? `I'm reaching out from ${ctx.senderCompany}`
    : "I'm reaching out";
  if (whatYouDo) {
    parts.push(`${opener} — ${lowerFirst(ensurePeriod(whatYouDo))}`);
  } else {
    parts.push(`${opener}.`);
  }

  const why = firstSentence(packet.why_match);
  const angle = firstSentence(packet.suggested_angle);
  const goal = clean(sender?.goal);

  if (why && angle) {
    parts.push(
      `You stood out because ${lowerFirst(stripPeriod(why))}, and I had a specific angle in mind: ${lowerFirst(stripPeriod(angle))}.`,
    );
  } else if (why) {
    parts.push(`You stood out because ${lowerFirst(ensurePeriod(why))}`);
  } else if (angle) {
    parts.push(`I had a specific angle in mind: ${lowerFirst(ensurePeriod(angle))}`);
  }

  if (goal) {
    parts.push(`I'd love to ${lowerFirst(stripLeadingTo(stripPeriod(goal)))}.`);
  }

  return parts.join(' ').trim();
}

function buildContextLines(packet: MatchCard): string[] {
  const notes = (packet.notes || []).map(clean).filter(Boolean) as string[];
  if (notes.length === 0) return [];

  const picked = notes.slice(0, 2).map((n) => lowerFirst(stripBullet(n)));
  if (picked.length === 1) {
    return [`One thing that caught my eye: ${ensurePeriod(picked[0])}`];
  }
  return [
    `A couple of things stood out: ${ensurePeriod(picked[0])} Also, ${ensurePeriod(picked[1])}`,
  ];
}

function buildAsk(): string {
  return (
    'Would you be open to a short conversation in the next week or two? ' +
    "I'd keep it brief and work entirely around your schedule — even 15 minutes would be plenty to see if it's worth exploring further."
  );
}

function stripLeadingTo(text: string): string {
  return text.replace(/^to\s+/i, '').trim();
}

// ── small pure string helpers ──────────────────────────────────────────────

function clean(v?: string): string {
  return (v || '').trim().replace(/\s+/g, ' ');
}

function firstName(name?: string): string {
  const n = clean(name);
  if (!n) return '';
  return n.split(' ')[0];
}

function firstSentence(text?: string): string {
  const t = clean(text);
  if (!t) return '';
  const m = t.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : t).trim().replace(/[.!?]+$/, '');
}

function stripBullet(text: string): string {
  return text.replace(/^[\s•\-*•]+/, '').replace(/[.!?]+$/, '').trim();
}

function lowerFirst(text: string): string {
  const t = text.trim();
  if (!t) return t;
  // Don't lowercase acronyms / proper-looking all-caps starts.
  if (/^[A-Z]{2,}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function ensurePeriod(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function stripPeriod(text: string): string {
  return text.trim().replace(/[.!?]+$/, '');
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Trim the soft-ask paragraph first if we're over the target word range. */
function trimToWordRange(body: string, min: number, max: number): string {
  let result = body;
  if (wordCount(result) <= max) return result;

  const ask = buildAsk();
  const shortAsk =
    'Would you be open to a brief chat in the next week or two? Happy to work around your schedule.';
  if (result.includes(ask)) {
    result = result.replace(ask, shortAsk);
  }
  if (wordCount(result) <= max) return result;

  // Drop the second context sentence if still too long.
  const contextSplit = result.split('\n\n');
  if (contextSplit.length >= 3) {
    const filtered = contextSplit.filter(
      (p) => !p.startsWith('A couple of things stood out:') || !p.includes(' Also, '),
    );
    if (filtered.length < contextSplit.length) {
      result = filtered.join('\n\n');
    }
  }
  return result;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}
