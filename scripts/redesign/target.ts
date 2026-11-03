/**
 * Where the harness points. By default: a local build wired to the fake host below.
 *
 * To check a deployed preview with fake data, set BASE_URL to the preview (a share link if it
 * is protected) and SUPABASE_HOST to the Supabase URL baked into that build. Every request to
 * that host is then answered by mock.ts / backend.ts in the browser, so the page renders the
 * fixtures and nothing reaches the real database (the fake session's token is not a valid JWT
 * there either).
 */
export const SUPABASE_HOST = (process.env.SUPABASE_HOST ?? 'https://mock.supabase.co').replace(
  /\/$/,
  '',
);

/** supabase-js keeps the session under sb-<project ref>-auth-token. */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_HOST).hostname.split('.')[0]}-auth-token`;
