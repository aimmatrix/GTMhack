import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandoffRequest, MatchCard } from '../src/types';

const samplePacket: MatchCard = {
  id: 'card-1',
  match: {
    name: 'Sarah Chen',
    company: 'Northwind Analytics',
    role: 'VP Partnerships',
    email: 'sarah@northwind.example',
  },
  why_match:
    'Northwind recently expanded into European markets and posted a Head of Partnerships role.',
  notes: [
    'Announced a Series B last quarter focused on partner-led growth.',
    'Careers page lists API integrations as a top priority for 2025.',
  ],
  suggested_angle:
    'Lead with how your integration could support their DACH partner rollout without adding ops overhead.',
  sources: [{ url: 'https://northwind.example/news/series-b' }],
  confidence: 'high',
  lightfern: { completion_status: 'ready', completed_fields: ['why_match', 'notes'] },
};

const sampleSender = {
  name: 'Alex Rivera',
  company: 'Acme Corp',
  whatYouDo: 'We help B2B SaaS teams automate partner outreach.',
  goal: 'Explore whether a brief intro makes sense for both of us.',
  fromEmail: 'alex@acme.example',
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe('buildEmailFromPacket', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('includes packet-specific why_match, notes, and suggested_angle', async () => {
    const { buildEmailFromPacket } = await import('../src/handoff/packet');
    const { subject, body } = buildEmailFromPacket(samplePacket, sampleSender);

    expect(subject).toContain('Acme Corp');
    expect(subject).toContain('Northwind Analytics');
    expect(body).toContain('Hi Sarah,');
    expect(body).toContain('European markets');
    expect(body).toContain('DACH partner rollout');
    expect(body).toContain('Series B');
    expect(body).toContain('Alex Rivera');
    expect(body).toContain('Acme Corp');
    expect(wordCount(body)).toBeGreaterThanOrEqual(80);
    expect(wordCount(body)).toBeLessThanOrEqual(180);
  });
});

describe('GmailClient.composeLink', () => {
  it('URL-encodes to, subject, and body', async () => {
    const { GmailClient } = await import('../src/handoff/gmail');
    const url = GmailClient.composeLink({
      to: 'a+b@example.com',
      subject: 'Hello & welcome',
      body: 'Line one\nLine two & more',
    });

    expect(url).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?/);
    expect(url).toContain(`to=${encodeURIComponent('a+b@example.com')}`);
    expect(url).toContain(`su=${encodeURIComponent('Hello & welcome')}`);
    expect(url).toContain(`body=${encodeURIComponent('Line one\nLine two & more')}`);
    expect(url).not.toContain('a+b@example.com');
    expect(url).not.toContain('Hello & welcome');
  });
});

describe('createHandoffService', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns compose_link when OAuth is not configured', async () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
    process.env.HANDOFF_MODE = 'auto';

    const { createHandoffService } = await import('../src/handoff');
    const result = await createHandoffService().handoff({
      packet: samplePacket,
      sender: sampleSender,
    } satisfies HandoffRequest);

    expect(result.mode).toBe('compose_link');
    expect(result.gmailUrl).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?/);
    expect(result.subject).toBeTruthy();
    expect(result.body).toMatch(/northwind|European markets/i);
  });

  it('falls back to compose_link when Gmail API throws', async () => {
    process.env.GMAIL_CLIENT_ID = 'test-client';
    process.env.GMAIL_CLIENT_SECRET = 'test-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh';
    process.env.GMAIL_SENDER = 'demo@example.com';
    process.env.HANDOFF_MODE = 'gmail_api';

    vi.doMock('../src/handoff/gmail', () => ({
      GmailClient: class {
        createDraft = vi.fn().mockRejectedValue(new Error('api down'));
        static composeLink = (args: { to?: string; subject: string; body: string }) =>
          `https://mail.google.com/mail/?compose=fallback&su=${encodeURIComponent(args.subject)}`;
      },
    }));

    const { createHandoffService } = await import('../src/handoff');
    const result = await createHandoffService().handoff({
      packet: samplePacket,
      sender: sampleSender,
    });

    expect(result.mode).toBe('compose_link');
    expect(result.gmailUrl).toContain('compose=fallback');
    expect(result.subject).toBeTruthy();
    expect(result.body).toContain('Series B');
  });
});
