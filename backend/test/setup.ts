/** Force mock providers before any backend modules load. */
process.env.SEARCH_PROVIDER = 'mock';
process.env.LLM_PROVIDER = 'mock';
process.env.HANDOFF_MODE = 'compose_link';
delete process.env.UNIFY_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GMAIL_CLIENT_ID;
delete process.env.GMAIL_CLIENT_SECRET;
delete process.env.GMAIL_REFRESH_TOKEN;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_KEY;
