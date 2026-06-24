/**
 * Typed access to Vite public env vars. Only `VITE_`-prefixed vars reach the client.
 * Server-only secrets (Mapbox tokens, service-role keys) live in /api functions, never here.
 */

interface PublicEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy apps/web/.env.example to apps/web/.env and fill it in.`,
    );
  }
  return value;
}

export const env: PublicEnv = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
};
