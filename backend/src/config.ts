import 'dotenv/config';

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const unifyApiKey = str('UNIFY_API_KEY');
const geminiApiKey = str('GEMINI_API_KEY');
const gmailConfigured =
  !!str('GMAIL_CLIENT_ID') && !!str('GMAIL_CLIENT_SECRET') && !!str('GMAIL_REFRESH_TOKEN');

function pick<T extends string>(forced: string, auto: T, live: T, mock: T): T {
  if (forced === live || forced === mock) return forced as T;
  return auto;
}

export const config = {
  port: int('PORT', 8787),
  corsOrigin: str('CORS_ORIGIN', '*'),
  logLevel: str('LOG_LEVEL', 'info'),
  maxResults: int('MAX_RESULTS', 8),

  search: {
    /** "unify" if a key exists (unless forced), else "mock". */
    provider: pick(str('SEARCH_PROVIDER', 'auto'), unifyApiKey ? 'unify' : 'mock', 'unify', 'mock') as
      | 'unify'
      | 'mock',
    apiKey: unifyApiKey,
    baseUrl: str('UNIFY_API_BASE_URL', 'https://api.explorium.ai/v1'),
  },

  llm: {
    provider: pick(str('LLM_PROVIDER', 'auto'), geminiApiKey ? 'gemini' : 'mock', 'gemini', 'mock') as
      | 'gemini'
      | 'mock',
    apiKey: geminiApiKey,
    model: str('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  gmail: {
    clientId: str('GMAIL_CLIENT_ID'),
    clientSecret: str('GMAIL_CLIENT_SECRET'),
    refreshToken: str('GMAIL_REFRESH_TOKEN'),
    sender: str('GMAIL_SENDER'),
    configured: gmailConfigured,
    /** "gmail_api" when OAuth present (unless forced), else "compose_link". */
    mode: pick(
      str('HANDOFF_MODE', 'auto'),
      gmailConfigured ? 'gmail_api' : 'compose_link',
      'gmail_api',
      'compose_link',
    ) as 'gmail_api' | 'compose_link',
  },
} as const;

export type AppConfig = typeof config;
