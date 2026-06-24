import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { AuthContext, type Profile } from './context.js';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('app_user')
    .select('*, org:org_id(*)')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile', error);
    return null;
  }
  if (!data || !data.org) return null;

  const { org, ...user } = data;
  return { user, org };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileForSession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (next?.user) {
      setProfile(await fetchProfile(next.user.id));
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await loadProfileForSession(data.session);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void loadProfileForSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfileForSession]);

  const reloadProfile = useCallback(async () => {
    if (session?.user) setProfile(await fetchProfile(session.user.id));
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, reloadProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
