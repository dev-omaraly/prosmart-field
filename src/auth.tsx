import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Profile } from './types';
import { unregisterPush } from './lib/push';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const p = data as Profile | null;
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
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, profile, loading, notice, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
