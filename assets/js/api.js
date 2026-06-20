/** Backend API client — the only module that talks to the Noodle Reach API. */

export const BASE_URL =
  (typeof localStorage !== "undefined" && localStorage.getItem("noodle-api")) ||
  "http://localhost:8787";

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `request failed (${res.status})`);
  }
  return res.json();
}

/** @param {{ description: string, targetType?: string, goal?: string, location?: string }} input */
export async function buildBrief({ description, targetType, goal, location }) {
  const body = await postJson("/api/brief", {
    description,
    ...(targetType != null && { targetType }),
    ...(goal != null && { goal }),
    ...(location != null && { location }),
  });
  return body.brief;
}

/**
 * Stream a run via POST + SSE (fetch reader, not EventSource).
 * @param {{ brief?: object } | { input?: object }} body
 * @param {{ onRun?, onStatus?, onCard?, onDone?, onError? }} handlers
 */
export async function streamRun(
  body,
  { onRun, onStatus, onCard, onDone, onError } = {},
) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    onError?.(err.message ?? String(err));
    throw err;
  }

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const message = err.error ?? `run failed (${res.status})`;
    onError?.(message);
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let runId = "";
  let stats = { found: 0, researched: 0, dropped: 0 };
  const cards = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;

        const evt = JSON.parse(dataLine.slice(6));
        switch (evt.type) {
          case "run":
            runId = evt.runId;
            onRun?.(evt.runId, evt.brief);
            break;
          case "status":
            onStatus?.(evt.message, evt.found, evt.researched);
            break;
          case "card":
            cards.push(evt.card);
            onCard?.(evt.card);
            break;
          case "done":
            stats = evt.stats;
            onDone?.(evt.runId, evt.stats);
            break;
          case "error":
            onError?.(evt.message);
            throw new Error(evt.message);
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      onError?.(err.message ?? String(err));
    }
    throw err;
  }

  if (!runId) {
    const message = "stream ended without run event";
    onError?.(message);
    throw new Error(message);
  }

  return { runId, stats, cards };
}

/** @param {{ packet: object, sender?: object, runId?: string, cardId?: string }} req */
export async function handoff({ packet, sender, runId, cardId }) {
  const body = await postJson("/api/lightfern/handoff", {
    packet,
    ...(sender != null && { sender }),
    ...(runId != null && { runId }),
    ...(cardId != null && { cardId }),
  });
  return body.result;
}

/** @param {string} id */
export async function getRun(id) {
  const res = await fetch(`${BASE_URL}/api/run/${id}`);
  if (res.status === 404) throw new Error("run not found");
  if (!res.ok) throw new Error(`getRun failed (${res.status})`);
  const body = await res.json();
  return body.run;
}

export async function health() {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`health failed (${res.status})`);
  return res.json();
}
