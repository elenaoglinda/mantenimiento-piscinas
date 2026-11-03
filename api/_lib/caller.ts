import type { VercelRequest } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client that acts AS THE CALLER: the anon key plus the caller's own access token,
 * so every query and storage call goes through RLS exactly as it would in their browser.
 * Never the service-role key — a request path that bypassed RLS could read any org's data.
 *
 * Returns null unless the bearer token belongs to a live session (checked with Auth first,
 * like api/extract-reading.ts), so an expired token gets a clear 401 instead of empty results.
 */
export async function callerClient(
  req: VercelRequest,
): Promise<{ client: SupabaseClient; userId: string } | null | 'not_configured'> {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return 'not_configured';

  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;

  try {
    const resp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: auth },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as { id?: string };
    if (!user.id) return null;
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return { client, userId: user.id };
  } catch {
    return null;
  }
}
