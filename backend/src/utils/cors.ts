import { config } from '../config';

/** CORS response headers for hijacked/streaming routes (bypass @fastify/cors). */
export function corsOriginHeader(requestOrigin?: string): Record<string, string> {
  const policy = config.corsOrigin;
  if (policy === '*') {
    return { 'Access-Control-Allow-Origin': requestOrigin ?? '*' };
  }
  const allowed = policy.split(',').map((entry) => entry.trim());
  if (requestOrigin && allowed.includes(requestOrigin)) {
    return { 'Access-Control-Allow-Origin': requestOrigin, Vary: 'Origin' };
  }
  return {};
}
