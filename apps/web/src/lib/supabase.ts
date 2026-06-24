import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from './database.types.js';

/**
 * Browser Supabase client (anon key). All access is gated by Row-Level Security on the
 * database; this key is safe to ship. Session is persisted for the PWA.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
