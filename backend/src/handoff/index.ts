import type { HandoffRequest, HandoffResult, HandoffService } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { buildEmailFromPacket } from './packet';
import { GmailClient } from './gmail';

const log = logger('handoff');

/**
 * Handoff layer: research packet → Gmail context draft for Lightfern.
 *
 * The final step does NOT call Lightfern (no API). Instead it prepares a Gmail
 * draft filled with recipient context (role, company, background facts, outreach
 * angle, sender goal). When OAuth is configured we create a real Gmail draft;
 * otherwise (or on any failure) we return a no-auth Gmail compose deep-link so
 * the demo always works. The user opens Gmail and runs the Lightfern extension
 * there to write and send the email from that context.
 */
export function createHandoffService(): HandoffService {
  return {
    async handoff(req: HandoffRequest): Promise<HandoffResult> {
      const email = buildEmailFromPacket(req.packet, req.sender);
      const { to, subject, body } = email;

      // 1. Real Gmail draft when OAuth is configured.
      if (config.gmail.mode === 'gmail_api' && config.gmail.configured) {
        try {
          const from = req.sender?.fromEmail || config.gmail.sender || undefined;
          const { draftId, gmailUrl } = await new GmailClient().createDraft({
            to,
            subject,
            body,
            from,
          });
          return {
            mode: 'gmail_draft',
            draftId,
            gmailUrl,
            to,
            subject,
            body,
            message: 'Context draft created in Gmail — open it and run Lightfern.',
          };
        } catch (err) {
          log.warn('gmail draft failed, falling back to compose link', (err as Error).message);
          // fall through to compose-link path
        }
      }

      // 2. No-auth compose deep-link (also the default when mode=compose_link).
      //    This path never throws.
      try {
        const gmailUrl = GmailClient.composeLink({ to, subject, body });
        return {
          mode: 'compose_link',
          gmailUrl,
          to,
          subject,
          body,
          message: 'Opens Gmail with outreach context — run the Lightfern extension there.',
        };
      } catch (err) {
        // 3. Absolute last resort — still hand back the prepared draft.
        log.error('compose link build failed unexpectedly', (err as Error).message);
        return {
          mode: 'mock',
          to,
          subject,
          body,
          message: 'Draft prepared.',
        };
      }
    },
  };
}
