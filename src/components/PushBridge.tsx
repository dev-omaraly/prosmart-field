import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { homePath } from '../types';
import { registerPush, setupChannel } from '../lib/push';

// Lives inside the router. Registers the phone for push once a user is signed in,
// and opens the full message when a notification is tapped (even from a cold start).
export default function PushBridge() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const pending = useRef<string | null>(null);
  const role = profile?.role;

  const go = useCallback(() => {
    if (pending.current && role) {
      nav(`${homePath(role)}/inbox/${pending.current}`);
      pending.current = null;
    }
  }, [nav, role]);

  const onOpen = useCallback(
    (id: string) => {
      pending.current = id;
      go();
    },
    [go],
  );

  useEffect(() => {
    setupChannel();
  }, []);

  useEffect(() => {
    if (profile) registerPush(onOpen);
  }, [profile, onOpen]);

  useEffect(go, [go]);
  return null;
}
