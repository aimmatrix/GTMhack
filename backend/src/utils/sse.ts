import type { FastifyReply } from 'fastify';
import type { RunEvent } from '../types';

/**
 * Minimal Server-Sent Events writer for the streaming /api/run endpoint.
 * The frontend consumes this with EventSource or fetch + ReadableStream.
 */
export class SSEStream {
  private closed = false;

  constructor(private reply: FastifyReply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Flush headers immediately.
    reply.raw.write(': connected\n\n');
  }

  /** Send a typed run event. The event name mirrors `event.type`. */
  send(event: RunEvent) {
    if (this.closed) return;
    this.reply.raw.write(`event: ${event.type}\n`);
    this.reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /** Heartbeat comment to keep proxies from closing the connection. */
  ping() {
    if (this.closed) return;
    this.reply.raw.write(': ping\n\n');
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.reply.raw.end();
  }

  get isClosed() {
    return this.closed;
  }
}
