import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Profile } from './types';
import { unregisterPush } from './lib/push';
import { AUTH_STORAGE_KEY } from './lib/config';
import { setCurrentUser } from './lib/offline';

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  notice: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

// When the phone is offline and the saved token has expired, supabase-js cannot refresh it and reports "no session".
// We then keep the user inside the app using the saved session; the token is refreshed automatically once online.
function storedSession(): Session | null {
  try {
    const j = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null');
    return j?.user && j?.access_token ? (j as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session ?? (navigator.onLine ? null : storedSession());
      setSession(s);
      if (!s) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!s && event !== 'SIGNED_OUT') return; // INITIAL_SESSION without a token (offline) must not log the user out
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  setCurrentUser(uid ?? null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const p = data as Profile | null;
        if (!p && error && !navigator.onLine) {
          setLoading(false); // offline and nothing cached yet: stay on login screen
          return;
        }
        if (!p) {
          setNotice('الحساب غير مكتمل، كلم الإدارة.');
          supabase.auth.signOut();
        } else if (!p.is_active) {
          setNotice('الحساب موقوف، كلم الإدارة.');
          supabase.auth.signOut();
        } else {
          setProfile(p);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const signIn = async (email: string, password: string) => {
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.includes('@') ? email.trim() : email.trim().toLowerCase() + '@prosmart.app',
      password,
    });
    if (!error) return null;
    const m = error.message.toLowerCase();
    if (m.includes('invalid login')) return 'الإيميل أو الباسورد غلط';
    if (m.includes('not confirmed')) return 'الحساب لسه متفعلش، كلم الإدارة';
    return 'خطأ: ' + error.message;
  };

  const signOut = async () => {
    await unregisterPush();
    const { error } = await supabase.auth.signOut();
    if (error) {
      // no internet: drop the local session so the user is really signed out
      localStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.reload();
    }
  };

  return (
    <Ctx.Provider value={{ session, profile, loading, notice, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
