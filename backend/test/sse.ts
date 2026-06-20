/** Parse a raw SSE payload into typed events (for tests and tooling). */
export function parseSSE(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  const chunks = raw.split('\n\n');

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed.startsWith(':')) continue;

    let event = 'message';
    let dataLine: string | undefined;

    for (const line of chunk.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      if (line.startsWith('data: ')) dataLine = line.slice(6);
    }

    if (dataLine) {
      events.push({ event, data: JSON.parse(dataLine) as Record<string, unknown> });
    }
  }

  return events;
}
