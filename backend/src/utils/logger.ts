/** Tiny leveled logger so modules don't pull in a dependency. */
const levels = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof levels;

const current: Level = (process.env.LOG_LEVEL as Level) || 'info';

function log(level: Level, scope: string, msg: string, extra?: unknown) {
  if (levels[level] > levels[current]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} (${scope}) ${msg}`;
  if (extra !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line, extra);
  } else {
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](line);
  }
}

export function logger(scope: string) {
  return {
    error: (m: string, e?: unknown) => log('error', scope, m, e),
    warn: (m: string, e?: unknown) => log('warn', scope, m, e),
    info: (m: string, e?: unknown) => log('info', scope, m, e),
    debug: (m: string, e?: unknown) => log('debug', scope, m, e),
  };
}
