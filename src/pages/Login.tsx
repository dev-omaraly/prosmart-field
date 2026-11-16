import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth';
import { homePath } from '../types';

export default function Login() {
  const { session, profile, notice, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session && profile) return <Navigate to={homePath(profile.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  const msg = error ?? notice;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-8">
      <img src="./logo.jpg" alt="Pro Smart" className="mx-auto mb-6 max-h-64 w-auto" />

      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          required
          autoCapitalize="none"
          autoComplete="username"
          placeholder="اليوزر أو الإيميل"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-left outline-none focus:border-brand"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="الباسورد"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-left outline-none focus:border-brand"
        />
        {msg && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-bold text-navy-950 active:bg-brand-dark disabled:opacity-60"
        >
          <LogIn size={18} />
          {busy ? 'جاري الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </div>
  );
}
