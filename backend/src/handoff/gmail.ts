import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger('handoff');

/** URL that opens the user's Gmail drafts view (fallback when message id is missing). */
const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/u/0/#drafts';

/**
 * Build a Gmail web URL that opens a specific draft compose editor.
 * Uses the draft message id returned by drafts.create (undocumented but widely used).
 */
export function draftGmailUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#drafts?compose=${encodeURIComponent(messageId)}`;
}

/**
 * Thin wrapper around the Gmail API (via `googleapis`) for creating drafts with
 * an OAuth2 refresh token, plus a no-auth compose deep-link fallback.
 *
 * The `googleapis` SDK is imported lazily inside {@link createDraft} so this
 * module — and the always-available {@link composeLink} path — never require
 * the dependency to be installed/loadable in the demo.
 *
 * Secrets (client secret, refresh token) are never logged.
 */
export class GmailClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly sender: string;

  constructor() {
    this.clientId = config.gmail.clientId;
    this.clientSecret = config.gmail.clientSecret;
    this.refreshToken = config.gmail.refreshToken;
    this.sender = config.gmail.sender;
  }

  /**
   * Create a Gmail draft from a prepared email. Builds a base64url RFC-2822
   * MIME message and calls `gmail.users.drafts.create`. Throws on any failure
   * (missing creds, API error) so the caller can fall back to a compose link.
   */
  async createDraft(args: {
    to?: string;
    subject: string;
    body: string;
    from?: string;
  }): Promise<{ draftId: string; gmailUrl: string }> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('gmail: OAuth credentials are not configured');
    }

    // Lazy import so the dependency is only needed when actually creating a draft.
    const { google } = await import('googleapis');

    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2 });

    const from = args.from || this.sender || undefined;
    const raw = buildMimeMessage({
      to: args.to,
      from,
      subject: args.subject,
      body: args.body,
    });

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    });

    const draftId = res.data.id;
    const messageId = res.data.message?.id;
    if (!draftId) {
      throw new Error('gmail: drafts.create returned no draft id');
    }

    const gmailUrl = messageId ? draftGmailUrl(messageId) : GMAIL_DRAFTS_URL;
    log.info(`created gmail draft (id=${draftId}, messageId=${messageId ?? 'n/a'})`);
    return { draftId, gmailUrl };
  }

  /**
   * No-auth Gmail compose deep-link. Always succeeds — opens a prefilled Gmail
   * compose window in the browser. Used as the universal demo fallback.
   */
  static composeLink(args: { to?: string; subject: string; body: string }): string {
    const params = [
      'view=cm',
      'fs=1',
      `to=${encodeURIComponent(args.to || '')}`,
      `su=${encodeURIComponent(args.subject || '')}`,
      `body=${encodeURIComponent(args.body || '')}`,
    ];
    return `https://mail.google.com/mail/?${params.join('&')}`;
  }
}

/**
 * Build a base64url-encoded RFC-2822 MIME message: From/To/Subject headers and
 * a UTF-8 plain-text body. Subject is RFC-2047 encoded so non-ASCII survives.
 */
function buildMimeMessage(args: {
  to?: string;
  from?: string;
  subject: string;
  body: string;
}): string {
  const headers: string[] = [];
  if (args.from) headers.push(`From: ${args.from}`);
  if (args.to) headers.push(`To: ${args.to}`);
  headers.push(`Subject: ${encodeHeader(args.subject)}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: 8bit');

  const message = `${headers.join('\r\n')}\r\n\r\n${args.body}`;
  return base64Url(message);
}

/**
 * RFC-2047 "encoded-word" for header values, only when non-ASCII is present.
 * Keeps plain-ASCII subjects readable in transit/debugging.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  const b64 = Buffer.from(value, 'utf-8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function base64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
