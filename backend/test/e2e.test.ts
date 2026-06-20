import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server';
import type { MatchCard, RunEvent, SearchBrief } from '../src/types';
import { parseSSE } from './sse';

describe.sequential('Lightfern Reach API (E2E, mock mode)', () => {
  let app: FastifyInstance;
  let baseUrl: string;
  let runId: string;
  let cards: MatchCard[] = [];

  beforeAll(async () => {
    app = buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('failed to bind test server');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/brief returns a valid brief', async () => {
    const res = await fetch(`${baseUrl}/api/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'pre-seed investors in London who back AI sales tools',
        targetType: 'investors',
        goal: 'introduce our Lightfern hackathon project',
        location: 'London',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { brief: SearchBrief };
    expect(body.brief).toBeDefined();
    expect(body.brief.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.brief.targetType).toBe('investors');
    expect(body.brief.entity).toBe('people');
    expect(body.brief.looking_for).toBeTruthy();
    expect(body.brief.max_results).toBeGreaterThan(0);
    expect(body.brief.filters).toBeDefined();
  });

  it('POST /api/run streams run → status → card (≥1) → done', async () => {
    const briefRes = await fetch(`${baseUrl}/api/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'pre-seed investors in London who back AI sales tools',
        targetType: 'investors',
        goal: 'introduce our Lightfern hackathon project',
        location: 'London',
      }),
    });
    const { brief } = (await briefRes.json()) as { brief: SearchBrief };

    const runRes = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
    });

    expect(runRes.status).toBe(200);
    expect(runRes.headers.get('content-type')).toContain('text/event-stream');

    const raw = await runRes.text();
    const parsed = parseSSE(raw);
    const events = parsed.map((e) => e.data as RunEvent);
    const eventTypes = events.map((e) => e.type);

    expect(eventTypes[0]).toBe('run');
    expect(eventTypes).toContain('status');
    expect(eventTypes.filter((t) => t === 'card').length).toBeGreaterThanOrEqual(1);
    expect(eventTypes[eventTypes.length - 1]).toBe('done');
    expect(eventTypes).not.toContain('error');

    const runEvt = events.find((e) => e.type === 'run');
    expect(runEvt && runEvt.type === 'run' && runEvt.runId).toBeTruthy();

    const doneEvt = events.find((e) => e.type === 'done');
    expect(doneEvt && doneEvt.type === 'done' && doneEvt.stats.researched).toBeGreaterThanOrEqual(1);

    runId = runEvt && runEvt.type === 'run' ? runEvt.runId : '';
    cards = events
      .filter((e): e is Extract<RunEvent, { type: 'card' }> => e.type === 'card')
      .map((e) => e.card);
    expect(runId).toBeTruthy();
  });

  it('GET /api/run/:id returns the run', async () => {
    expect(runId).toBeTruthy();

    const res = await fetch(`${baseUrl}/api/run/${runId}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { run: { id: string; status: string; cards: MatchCard[] } };
    expect(body.run.id).toBe(runId);
    expect(body.run.status).toBe('completed');
    expect(body.run.cards.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/lightfern/handoff returns compose_link with gmailUrl', async () => {
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const packet = cards[0];

    const res = await fetch(`${baseUrl}/api/lightfern/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId,
        cardId: packet.id,
        packet,
        sender: { name: 'Ammad', company: 'Lightfern Reach', goal: 'intro our hackathon project' },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { mode: string; gmailUrl?: string; subject: string; body: string };
    };

    expect(body.result.mode).toBe('compose_link');
    expect(body.result.gmailUrl).toMatch(/^https:\/\/mail\.google\.com\//);
    expect(body.result.subject).toBeTruthy();
    expect(body.result.body).toBeTruthy();
  });
});
