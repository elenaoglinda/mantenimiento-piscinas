import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Tables } from '../lib/database.types.js';

/** The signed-in user's app profile: their app_user row plus their org. */
export interface Profile {
  user: Tables<'app_user'>;
  org: Tables<'org'>;
}

export interface AuthContextValue {
  session: Session | null;
  /** Null when authenticated but not yet onboarded (no app_user row). */
  profile: Profile | null;
  loading: boolean;
  /** Re-fetch the profile after onboarding or profile edits. */
  reloadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
